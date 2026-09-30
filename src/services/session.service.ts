import QRCode from "qrcode";
import { env } from "../config/env.js";
import type { AttendanceStatus, Session, SessionStatus, SessionType } from "../generated/prisma/client.js";
import { badRequest, conflict, notFound } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { isPastScanWindow, isWithinScanWindow, signQrToken, verifyQrToken } from "../lib/qr-token.js";

export interface SessionInput {
  date: Date;
  startTime: Date;
  endTime: Date;
  type: SessionType;
}

/**
 * Stored status plus the clock: a SCHEDULED/ACTIVE session is shown as ACTIVE inside its scan window
 * and as ENDED once the window has passed, even if an admin never pressed "End session".
 */
export function effectiveStatus(session: Pick<Session, "status" | "startTime" | "endTime">, now = new Date()): SessionStatus {
  if (session.status === "ENDED" || session.status === "FINALIZED") return session.status;
  if (isPastScanWindow(session, now)) return "ENDED";
  if (isWithinScanWindow(session, now)) return "ACTIVE";
  return session.status;
}

async function getSessionOrThrow(id: string) {
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) throw notFound("Session");
  return session;
}

type Counts = Record<AttendanceStatus, number>;
const emptyCounts = (): Counts => ({ PENDING: 0, APPROVED: 0, REJECTED: 0, ABSENT: 0 });

async function countsBySession(sessionIds: string[]) {
  const groups = await prisma.attendanceRecord.groupBy({
    by: ["sessionId", "status"],
    where: { sessionId: { in: sessionIds } },
    _count: { _all: true },
  });
  const map = new Map<string, Counts>();
  for (const g of groups) {
    const counts = map.get(g.sessionId) ?? emptyCounts();
    counts[g.status] = g._count._all;
    map.set(g.sessionId, counts);
  }
  return map;
}

function toDto(session: Session, counts: Counts = emptyCounts()) {
  const { qrToken: _qrToken, ...rest } = session;
  const total = counts.PENDING + counts.APPROVED + counts.REJECTED + counts.ABSENT;
  return {
    ...rest,
    status: effectiveStatus(session),
    counts,
    // Only meaningful once finalized (every eligible player then has a record).
    attendancePercent: session.status === "FINALIZED" && total > 0 ? Math.round((counts.APPROVED / total) * 1000) / 10 : null,
  };
}

export async function listSessions(opts: { limit: number; status?: SessionStatus }) {
  const sessions = await prisma.session.findMany({
    where: opts.status ? { status: opts.status } : undefined,
    orderBy: { startTime: "desc" },
    take: opts.limit,
  });
  const counts = await countsBySession(sessions.map((s) => s.id));
  return sessions.map((s) => toDto(s, counts.get(s.id)));
}

export async function getSession(id: string) {
  const session = await getSessionOrThrow(id);
  const counts = await countsBySession([id]);
  return toDto(session, counts.get(id));
}

export async function createSession(input: SessionInput, createdById: string) {
  if (input.endTime <= input.startTime) throw badRequest("End time must be after start time");

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.session.create({ data: { ...input, createdById } });
    return tx.session.update({ where: { id: created.id }, data: { qrToken: signQrToken(created.id, created.endTime) } });
  });
  return toDto(session);
}

export async function updateSession(id: string, input: Partial<SessionInput>) {
  const current = await getSessionOrThrow(id);
  if (current.status === "FINALIZED") throw conflict("Finalized sessions cannot be edited");

  const startTime = input.startTime ?? current.startTime;
  const endTime = input.endTime ?? current.endTime;
  if (endTime <= startTime) throw badRequest("End time must be after start time");

  // Re-sign so the QR expires with the new end time; previously shared QR codes stop working.
  const session = await prisma.session.update({
    where: { id },
    data: { ...input, qrToken: input.endTime ? signQrToken(id, endTime) : undefined },
  });
  return getSession(session.id);
}

export async function deleteSession(id: string) {
  await prisma.session.delete({ where: { id } });
}

export async function getSessionQr(id: string) {
  const session = await getSessionOrThrow(id);
  if (!session.qrToken) throw conflict("This session has no QR code");

  const url = `${env.clientUrl}/attend/${session.id}?t=${encodeURIComponent(session.qrToken)}`;
  const [pngDataUrl, svg] = await Promise.all([
    QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M" }),
    QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" }),
  ]);
  return { url, pngDataUrl, svg, status: effectiveStatus(session), startTime: session.startTime, endTime: session.endTime };
}

export async function endSession(id: string) {
  const session = await getSessionOrThrow(id);
  if (session.status === "FINALIZED") throw conflict("Session is already finalized");
  await prisma.session.update({ where: { id }, data: { status: "ENDED" } });
  return getSession(id);
}

export async function listSessionAttendance(id: string) {
  const session = await getSession(id);
  const records = await prisma.attendanceRecord.findMany({
    where: { sessionId: id },
    orderBy: [{ scannedAt: { sort: "asc", nulls: "last" } }],
    select: {
      id: true,
      status: true,
      scannedAt: true,
      reviewedAt: true,
      reviewedBy: { select: { id: true, email: true } },
      player: { select: { id: true, name: true, jerseyNumber: true, profilePicUrl: true, batch: true, position: true } },
    },
  });
  return { session, records };
}

/** Admin adds or corrects a record by hand (e.g. a player without their phone). */
export async function setPlayerAttendance(sessionId: string, playerId: string, status: AttendanceStatus, reviewerId: string) {
  await getSessionOrThrow(sessionId);
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true } });
  if (!player) throw notFound("Player");

  const reviewed = { status, reviewedAt: new Date(), reviewedById: reviewerId };
  return prisma.attendanceRecord.upsert({
    where: { sessionId_playerId: { sessionId, playerId } },
    create: { sessionId, playerId, ...reviewed },
    update: reviewed,
  });
}

export async function reviewAttendance(recordId: string, status: "APPROVED" | "REJECTED" | "ABSENT", reviewerId: string) {
  return prisma.attendanceRecord.update({
    where: { id: recordId },
    data: { status, reviewedAt: new Date(), reviewedById: reviewerId },
    select: { id: true, status: true, reviewedAt: true, sessionId: true },
  });
}

export async function approveAllPending(sessionId: string, reviewerId: string) {
  await getSessionOrThrow(sessionId);
  const { count } = await prisma.attendanceRecord.updateMany({
    where: { sessionId, status: "PENDING" },
    data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: reviewerId },
  });
  return { approved: count };
}

/** Marks every eligible active player without a record ABSENT and locks the session into the stats. */
export async function finalizeSession(id: string) {
  const session = await getSessionOrThrow(id);
  const status = effectiveStatus(session);
  if (status === "FINALIZED") throw conflict("Session is already finalized");
  if (status !== "ENDED") throw conflict("End the session before finalizing it");

  const pending = await prisma.attendanceRecord.count({ where: { sessionId: id, status: "PENDING" } });
  if (pending > 0) throw conflict(`${pending} record${pending === 1 ? " is" : "s are"} still pending review`);

  const absentees = await prisma.player.findMany({
    where: { isActive: true, joinedAt: { lte: session.endTime }, attendanceRecords: { none: { sessionId: id } } },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.attendanceRecord.createMany({
      data: absentees.map((p) => ({ sessionId: id, playerId: p.id, status: "ABSENT" as const })),
      skipDuplicates: true,
    }),
    prisma.session.update({ where: { id }, data: { status: "FINALIZED" } }),
  ]);
  return getSession(id);
}

/** Player check-in from a scanned QR code. */
export async function attend(
  user: { playerId: string | null; playerConfirmedAt: Date | null },
  sessionId: string,
  token: string,
) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || !session.qrToken || token !== session.qrToken || !verifyQrToken(token, sessionId)) {
    throw badRequest("This QR code is invalid or has expired");
  }

  const status = effectiveStatus(session);
  if (status === "ENDED" || status === "FINALIZED") throw conflict("This session has ended");
  if (status !== "ACTIVE") throw conflict("Check-in for this session hasn't opened yet");

  if (!user.playerId) throw badRequest("Your account is not linked to a player");
  if (!user.playerConfirmedAt) throw badRequest("Your account is waiting for admin confirmation");

  const player = await prisma.player.findUnique({ where: { id: user.playerId }, select: { id: true, isActive: true, name: true } });
  if (!player?.isActive) throw badRequest("Your player profile is inactive");

  const existing = await prisma.attendanceRecord.findUnique({
    where: { sessionId_playerId: { sessionId, playerId: player.id } },
    select: { id: true },
  });
  if (existing) throw conflict("You have already checked in to this session");

  const [record] = await prisma.$transaction([
    prisma.attendanceRecord.create({
      data: { sessionId, playerId: player.id, status: "PENDING", scannedAt: new Date() },
      select: { id: true, status: true, scannedAt: true },
    }),
    prisma.session.updateMany({ where: { id: sessionId, status: "SCHEDULED" }, data: { status: "ACTIVE" } }),
  ]);
  return { record, session: { id: session.id, type: session.type, startTime: session.startTime, endTime: session.endTime }, player: { name: player.name } };
}

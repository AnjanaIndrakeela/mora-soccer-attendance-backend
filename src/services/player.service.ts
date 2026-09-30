import { Prisma, type Player } from "../generated/prisma/client.js";
import { uploadPlayerImage } from "../lib/cloudinary.js";
import { notFound } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { emptyPoints, getPlayerMatchHistory, getPointsSummaries, type PointsSummary } from "./points.service.js";

export interface PlayerInput {
  name: string;
  indexNo: string;
  jerseyNumber?: number | null;
  position?: string | null;
  birthday?: Date | null;
  batch?: string | null;
  department?: string | null;
  faculty?: string | null;
  contactNo?: string | null;
  isActive?: boolean;
  joinedAt?: Date;
}

export interface AttendanceSummary {
  approved: number;
  total: number;
  /** Null until the player has at least one finalized session. */
  percent: number | null;
}

interface Viewer {
  role: "ADMIN" | "PLAYER";
  playerId: string | null;
}

/**
 * attendance % = approved records / finalized sessions held since the player joined.
 * A session counts for a player if it ended after they joined.
 */
export async function getAttendanceSummaries(playerIds: string[]): Promise<Map<string, AttendanceSummary>> {
  if (playerIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ id: string; approved: number; total: number }[]>`
    SELECT p.id,
      COUNT(s.id)::int AS total,
      COUNT(ar.id) FILTER (WHERE ar.status = 'APPROVED')::int AS approved
    FROM "Player" p
    LEFT JOIN "Session" s ON s.status = 'FINALIZED' AND s."endTime" >= p."joinedAt"
    LEFT JOIN "AttendanceRecord" ar ON ar."sessionId" = s.id AND ar."playerId" = p.id
    WHERE p.id IN (${Prisma.join(playerIds)})
    GROUP BY p.id`;
  return new Map(rows.map((r) => [r.id, toSummary(r.approved, r.total)]));
}

export function toSummary(approved: number, total: number): AttendanceSummary {
  return { approved, total, percent: total === 0 ? null : Math.round((approved / total) * 1000) / 10 };
}

/** Birthday, contact number and index number are only shown to admins and to the player themselves. */
function toDto(player: Player, attendance: AttendanceSummary | undefined, points: PointsSummary | undefined, viewer: Viewer) {
  const canSeePrivate = viewer.role === "ADMIN" || viewer.playerId === player.id;
  const { birthday, contactNo, indexNo, ...rest } = player;
  return {
    ...rest,
    ...(canSeePrivate ? { birthday, contactNo, indexNo } : {}),
    attendance: attendance ?? toSummary(0, 0),
    points: points ?? emptyPoints(),
  };
}

export async function listPlayers(
  opts: { sort: "attendance" | "points" | "name" | "number"; limit?: number; includeInactive: boolean; search?: string },
  viewer: Viewer,
) {
  const where: Prisma.PlayerWhereInput = {
    ...(opts.includeInactive ? {} : { isActive: true }),
    ...(opts.search
      ? { OR: [{ name: { contains: opts.search, mode: "insensitive" } }, { indexNo: { contains: opts.search, mode: "insensitive" } }] }
      : {}),
  };

  const [players, total] = await Promise.all([
    prisma.player.findMany({
      where,
      orderBy: opts.sort === "number" ? [{ jerseyNumber: { sort: "asc", nulls: "last" } }, { name: "asc" }] : { name: "asc" },
    }),
    prisma.player.count({ where }),
  ]);

  const ids = players.map((p) => p.id);
  const [summaries, points] = await Promise.all([getAttendanceSummaries(ids), getPointsSummaries(ids)]);
  let items = players.map((p) => toDto(p, summaries.get(p.id), points.get(p.id), viewer));

  // Each ranking breaks ties with the other one, then by name.
  const byAttendance = (a: (typeof items)[number], b: (typeof items)[number]) => (b.attendance.percent ?? -1) - (a.attendance.percent ?? -1);
  const byPoints = (a: (typeof items)[number], b: (typeof items)[number]) => b.points.points - a.points.points;
  if (opts.sort === "attendance") {
    items.sort((a, b) => byAttendance(a, b) || byPoints(a, b) || a.name.localeCompare(b.name));
  }
  if (opts.sort === "points") {
    items.sort((a, b) => byPoints(a, b) || byAttendance(a, b) || a.name.localeCompare(b.name));
  }
  if (opts.limit) items = items.slice(0, opts.limit);

  return { items, total };
}

export async function getPlayer(id: string, viewer: Viewer) {
  const player = await prisma.player.findUnique({ where: { id } });
  if (!player) throw notFound("Player");

  const [summaries, points, matchHistory] = await Promise.all([getAttendanceSummaries([id]), getPointsSummaries([id]), getPlayerMatchHistory(id)]);
  const recent = await prisma.attendanceRecord.findMany({
    where: { playerId: id, session: { status: "FINALIZED" } },
    orderBy: { session: { startTime: "desc" } },
    take: 20,
    select: { id: true, status: true, scannedAt: true, session: { select: { id: true, date: true, type: true, startTime: true } } },
  });

  return { ...toDto(player, summaries.get(id), points.get(id), viewer), recentAttendance: recent, matchHistory };
}

export async function createPlayer(input: PlayerInput, file: Express.Multer.File | undefined, viewer: Viewer) {
  const profilePicUrl = file ? await uploadPlayerImage(file) : null;
  const player = await prisma.player.create({ data: { ...input, profilePicUrl } });
  return toDto(player, undefined, undefined, viewer);
}

export async function updatePlayer(
  id: string,
  input: Partial<PlayerInput> & { removeProfilePic?: boolean },
  file: Express.Multer.File | undefined,
  viewer: Viewer,
) {
  const { removeProfilePic, ...data } = input;
  const profilePicUrl = file ? await uploadPlayerImage(file) : removeProfilePic ? null : undefined;
  const player = await prisma.player.update({ where: { id }, data: { ...data, profilePicUrl } });
  const [summaries, points] = await Promise.all([getAttendanceSummaries([id]), getPointsSummaries([id])]);
  return toDto(player, summaries.get(id), points.get(id), viewer);
}

/** Soft delete: history and stats are kept. */
export async function deactivatePlayer(id: string) {
  await prisma.player.update({ where: { id }, data: { isActive: false } });
}

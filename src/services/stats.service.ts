import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { toSummary } from "./player.service.js";

export interface DateRange {
  from?: Date;
  to?: Date;
}

const percent = (approved: number, total: number) => (total === 0 ? null : Math.round((approved / total) * 1000) / 10);

/** SQL fragment restricting finalized sessions (alias s) to the date range. */
function sessionRange(range: DateRange) {
  const parts = [Prisma.sql`s.status = 'FINALIZED'`];
  if (range.from) parts.push(Prisma.sql`s."startTime" >= ${range.from}`);
  if (range.to) parts.push(Prisma.sql`s."startTime" <= ${range.to}`);
  return Prisma.join(parts, " AND ");
}

export async function getDashboardStats() {
  const now = new Date();
  const [totalPlayers, totalSessions, totalMatches, nextTournament, breakdown] = await Promise.all([
    prisma.player.count({ where: { isActive: true } }),
    prisma.session.count({ where: { status: "FINALIZED" } }),
    prisma.match.count({ where: { date: { lte: now } } }),
    prisma.tournament.findFirst({
      where: { startDate: { gt: now } },
      orderBy: { startDate: "asc" },
      select: { id: true, name: true, venue: true, startDate: true, endDate: true },
    }),
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { session: { status: "FINALIZED" } },
      _count: { _all: true },
    }),
  ]);

  const counts = { APPROVED: 0, REJECTED: 0, ABSENT: 0 };
  for (const row of breakdown) if (row.status in counts) counts[row.status as keyof typeof counts] = row._count._all;
  const total = counts.APPROVED + counts.REJECTED + counts.ABSENT;

  return {
    totalPlayers,
    totalSessions,
    totalMatches,
    nextTournament,
    attendance: { ...counts, total, percent: percent(counts.APPROVED, total) },
  };
}

interface TrendRow {
  bucket: Date;
  sessionId: string | null;
  type: string | null;
  approved: number;
  total: number;
}

/** Attendance % per finalized session, or per week once there are many sessions. */
export async function getAttendanceTrend(opts: { groupBy: "session" | "week"; limit: number } & DateRange) {
  const where = sessionRange(opts);
  const rows =
    opts.groupBy === "week"
      ? await prisma.$queryRaw<TrendRow[]>`
          SELECT date_trunc('week', s."startTime") AS bucket, NULL AS "sessionId", NULL AS type,
            COUNT(ar.id) FILTER (WHERE ar.status = 'APPROVED')::int AS approved,
            COUNT(ar.id)::int AS total
          FROM "Session" s JOIN "AttendanceRecord" ar ON ar."sessionId" = s.id
          WHERE ${where}
          GROUP BY bucket ORDER BY bucket DESC LIMIT ${opts.limit}`
      : await prisma.$queryRaw<TrendRow[]>`
          SELECT s."startTime" AS bucket, s.id AS "sessionId", s.type::text AS type,
            COUNT(ar.id) FILTER (WHERE ar.status = 'APPROVED')::int AS approved,
            COUNT(ar.id)::int AS total
          FROM "Session" s JOIN "AttendanceRecord" ar ON ar."sessionId" = s.id
          WHERE ${where}
          GROUP BY s.id ORDER BY s."startTime" DESC LIMIT ${opts.limit}`;

  return rows.reverse().map((r) => ({
    date: r.bucket,
    sessionId: r.sessionId,
    type: r.type,
    approved: r.approved,
    total: r.total,
    percent: percent(r.approved, r.total),
  }));
}

interface GroupRow {
  key: string | null;
  approved: number;
  total: number;
}

async function attendanceBy(column: "type" | "batch" | "position", range: DateRange) {
  const key =
    column === "type" ? Prisma.sql`s.type::text` : column === "batch" ? Prisma.sql`p.batch` : Prisma.sql`p.position`;
  const rows = await prisma.$queryRaw<GroupRow[]>`
    SELECT ${key} AS key,
      COUNT(ar.id) FILTER (WHERE ar.status = 'APPROVED')::int AS approved,
      COUNT(ar.id)::int AS total
    FROM "AttendanceRecord" ar
    JOIN "Session" s ON s.id = ar."sessionId"
    JOIN "Player" p ON p.id = ar."playerId"
    WHERE ${sessionRange(range)}
    GROUP BY 1 ORDER BY 1 NULLS LAST`;
  return rows.map((r) => ({ key: r.key ?? "Unspecified", approved: r.approved, total: r.total, percent: percent(r.approved, r.total) }));
}

interface PlayerRow {
  id: string;
  name: string;
  jerseyNumber: number | null;
  profilePicUrl: string | null;
  batch: string | null;
  position: string | null;
  approved: number;
  total: number;
}

/** Per-player % over finalized sessions in the range that ended after the player joined. */
async function perPlayer(range: DateRange) {
  const rows = await prisma.$queryRaw<PlayerRow[]>`
    SELECT p.id, p.name, p."jerseyNumber", p."profilePicUrl", p.batch, p.position,
      COUNT(s.id)::int AS total,
      COUNT(ar.id) FILTER (WHERE ar.status = 'APPROVED')::int AS approved
    FROM "Player" p
    LEFT JOIN "Session" s ON s."endTime" >= p."joinedAt" AND ${sessionRange(range)}
    LEFT JOIN "AttendanceRecord" ar ON ar."sessionId" = s.id AND ar."playerId" = p.id
    WHERE p."isActive"
    GROUP BY p.id
    ORDER BY p.name`;
  return rows.map(({ approved, total, ...player }) => ({ ...player, ...toSummary(approved, total) }));
}

/** Current and longest runs of consecutive APPROVED records per active player. Small data, so done in JS. */
async function streaks(range: DateRange) {
  const records = await prisma.attendanceRecord.findMany({
    where: {
      player: { isActive: true },
      session: {
        status: "FINALIZED",
        startTime: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) },
      },
    },
    orderBy: { session: { startTime: "asc" } },
    select: { playerId: true, status: true, player: { select: { name: true } } },
  });

  const byPlayer = new Map<string, { name: string; current: number; longest: number }>();
  for (const r of records) {
    const s = byPlayer.get(r.playerId) ?? { name: r.player.name, current: 0, longest: 0 };
    s.current = r.status === "APPROVED" ? s.current + 1 : 0;
    s.longest = Math.max(s.longest, s.current);
    byPlayer.set(r.playerId, s);
  }
  return [...byPlayer.entries()]
    .map(([playerId, s]) => ({ playerId, ...s }))
    .sort((a, b) => b.current - a.current || b.longest - a.longest)
    .slice(0, 10);
}

async function matchRecord(range: DateRange) {
  const groups = await prisma.match.groupBy({
    by: ["result"],
    where: {
      result: { not: null },
      date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) },
    },
    _count: { _all: true },
    _sum: { scoreFor: true, scoreAgainst: true },
  });
  const record = { WIN: 0, DRAW: 0, LOSS: 0, goalsFor: 0, goalsAgainst: 0 };
  for (const g of groups) {
    if (g.result) record[g.result] = g._count._all;
    record.goalsFor += g._sum.scoreFor ?? 0;
    record.goalsAgainst += g._sum.scoreAgainst ?? 0;
  }
  return record;
}

export async function getProgressStats(range: DateRange & { atRiskThreshold: number }) {
  const [trend, byType, byBatch, byPosition, players, topStreaks, matches] = await Promise.all([
    getAttendanceTrend({ groupBy: "week", limit: 52, ...range }),
    attendanceBy("type", range),
    attendanceBy("batch", range),
    attendanceBy("position", range),
    perPlayer(range),
    streaks(range),
    matchRecord(range),
  ]);

  const atRisk = players
    .filter((p) => p.percent !== null && p.percent < range.atRiskThreshold)
    .sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0));

  return { trend, byType, byBatch, byPosition, perPlayer: players, atRisk, atRiskThreshold: range.atRiskThreshold, streaks: topStreaks, matchRecord: matches };
}

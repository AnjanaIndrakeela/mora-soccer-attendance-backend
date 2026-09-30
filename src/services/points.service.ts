import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { getAttendanceSummaries, toSummary } from "./player.service.js";

/** Points awarded per match event. The frontend reads these from GET /stats/points. */
export const POINTS = {
  appearance: 3,
  manOfTheMatch: 7,
  yellowCard: -1,
  redCard: -2,
} as const;

export interface PointsSummary {
  appearances: number;
  manOfTheMatch: number;
  yellowCards: number;
  redCards: number;
  points: number;
}

interface Row {
  id: string;
  appearances: number;
  motm: number;
  yellow: number;
  red: number;
}

export function toPoints(r: { appearances: number; motm: number; yellow: number; red: number }): PointsSummary {
  return {
    appearances: r.appearances,
    manOfTheMatch: r.motm,
    yellowCards: r.yellow,
    redCards: r.red,
    points: r.appearances * POINTS.appearance + r.motm * POINTS.manOfTheMatch + r.yellow * POINTS.yellowCard + r.red * POINTS.redCard,
  };
}

export const emptyPoints = (): PointsSummary => toPoints({ appearances: 0, motm: 0, yellow: 0, red: 0 });

/** Appearance, man-of-the-match and card totals per player, straight from match reports. */
async function pointsRows(where: Prisma.Sql) {
  return prisma.$queryRaw<Row[]>`
    SELECT p.id,
      COALESCE(a.appearances, 0)::int AS appearances,
      COALESCE(a.yellow, 0)::int AS yellow,
      COALESCE(a.red, 0)::int AS red,
      COALESCE(m.motm, 0)::int AS motm
    FROM "Player" p
    LEFT JOIN (
      SELECT "playerId", COUNT(*) AS appearances, SUM("yellowCards") AS yellow, SUM("redCards") AS red
      FROM "MatchAppearance" GROUP BY "playerId"
    ) a ON a."playerId" = p.id
    LEFT JOIN (
      SELECT "manOfTheMatchId", COUNT(*) AS motm FROM "Match" WHERE "manOfTheMatchId" IS NOT NULL GROUP BY "manOfTheMatchId"
    ) m ON m."manOfTheMatchId" = p.id
    WHERE ${where}`;
}

export async function getPointsSummaries(playerIds: string[]): Promise<Map<string, PointsSummary>> {
  if (playerIds.length === 0) return new Map();
  const rows = await pointsRows(Prisma.sql`p.id IN (${Prisma.join(playerIds)})`);
  return new Map(rows.map((r) => [r.id, toPoints(r)]));
}

/** Leaderboard of active players: highest points first, ties broken by attendance %, then name. */
export async function getPointsTable() {
  const rows = await pointsRows(Prisma.sql`p."isActive"`);
  const ids = rows.map((r) => r.id);
  const [players, attendance] = await Promise.all([
    prisma.player.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, jerseyNumber: true, profilePicUrl: true, position: true, batch: true },
    }),
    getAttendanceSummaries(ids),
  ]);
  const byId = new Map(players.map((p) => [p.id, p]));

  const table = rows
    .map((r) => ({ ...byId.get(r.id)!, ...toPoints(r), attendance: attendance.get(r.id) ?? toSummary(0, 0) }))
    .sort(
      (a, b) =>
        b.points - a.points || (b.attendance.percent ?? -1) - (a.attendance.percent ?? -1) || a.name.localeCompare(b.name),
    );

  return { rules: POINTS, players: table };
}

/** A player's match-by-match record, newest first, for their profile. */
export async function getPlayerMatchHistory(playerId: string) {
  const appearances = await prisma.matchAppearance.findMany({
    where: { playerId },
    orderBy: { match: { date: "desc" } },
    take: 20,
    select: {
      yellowCards: true,
      redCards: true,
      match: {
        select: {
          id: true,
          opponent: true,
          date: true,
          result: true,
          scoreFor: true,
          scoreAgainst: true,
          manOfTheMatchId: true,
          tournament: { select: { id: true, name: true } },
        },
      },
    },
  });

  return appearances.map(({ match, yellowCards, redCards }) => {
    const { manOfTheMatchId, ...rest } = match;
    const isMotm = manOfTheMatchId === playerId;
    return {
      ...rest,
      yellowCards,
      redCards,
      manOfTheMatch: isMotm,
      points: toPoints({ appearances: 1, motm: isMotm ? 1 : 0, yellow: yellowCards, red: redCards }).points,
    };
  });
}

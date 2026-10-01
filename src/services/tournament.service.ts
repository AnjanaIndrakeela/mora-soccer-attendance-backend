import type { MatchResult, Prisma } from "../generated/prisma/client.js";
import { badRequest, notFound } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

export interface TournamentInput {
  name: string;
  venue?: string | null;
  startDate: Date;
  endDate?: Date | null;
  description?: string | null;
}

export interface MatchInput {
  tournamentId?: string | null;
  opponent: string;
  date: Date;
  result?: MatchResult | null;
  scoreFor?: number | null;
  scoreAgainst?: number | null;
}

const matchOrder = { date: "asc" } as const;

/** What every match in a listing carries: the man of the match and how many players are in its report. */
const matchInclude = {
  manOfTheMatch: { select: { id: true, name: true, profilePicUrl: true } },
  _count: { select: { appearances: true } },
} as const;

/** A tournament is upcoming until it has finished (endDate, or startDate when there is no end date). */
function upcomingWhere(now: Date): Prisma.TournamentWhereInput {
  return { OR: [{ endDate: { gte: now } }, { endDate: null, startDate: { gte: now } }] };
}

export async function listTournaments(opts: { upcoming?: boolean }) {
  const now = new Date();
  const where = opts.upcoming === undefined ? undefined : opts.upcoming ? upcomingWhere(now) : { NOT: upcomingWhere(now) };
  return prisma.tournament.findMany({
    where,
    orderBy: { startDate: opts.upcoming === false ? "desc" : "asc" },
    include: { matches: { orderBy: matchOrder, include: matchInclude } },
  });
}

export async function getTournament(id: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id }, include: { matches: { orderBy: matchOrder, include: matchInclude } } });
  if (!tournament) throw notFound("Tournament");
  return tournament;
}

export const createTournament = (input: TournamentInput) => prisma.tournament.create({ data: input });

export async function updateTournament(id: string, input: Partial<TournamentInput>) {
  const current = await prisma.tournament.findUnique({ where: { id } });
  if (!current) throw notFound("Tournament");

  // A partial update can move either end, so check the dates the tournament will end up with.
  const startDate = input.startDate ?? current.startDate;
  const endDate = input.endDate === undefined ? current.endDate : input.endDate;
  if (endDate && endDate < startDate) throw badRequest("End date can't be before the start date");

  return prisma.tournament.update({ where: { id }, data: input });
}

export async function deleteTournament(id: string) {
  // Matches are kept as friendlies (tournamentId is set to null).
  await prisma.tournament.delete({ where: { id } });
}

/** Derives W/D/L from the score when the result isn't given explicitly. */
function withResult<T extends Partial<MatchInput>>(input: T): T {
  if (input.result !== undefined) return input;
  if (input.scoreFor == null || input.scoreAgainst == null) return input;
  const result: MatchResult = input.scoreFor > input.scoreAgainst ? "WIN" : input.scoreFor < input.scoreAgainst ? "LOSS" : "DRAW";
  return { ...input, result };
}

export function listMatches(opts: { tournamentId?: string; friendliesOnly?: boolean }) {
  return prisma.match.findMany({
    where: opts.friendliesOnly ? { tournamentId: null } : opts.tournamentId ? { tournamentId: opts.tournamentId } : undefined,
    orderBy: { date: "desc" },
    include: { tournament: { select: { id: true, name: true } }, ...matchInclude },
  });
}

export async function createMatch(input: MatchInput) {
  if (input.tournamentId) await getTournament(input.tournamentId);
  return prisma.match.create({ data: withResult(input) });
}

export const updateMatch = (id: string, input: Partial<MatchInput>) =>
  prisma.match.update({ where: { id }, data: withResult(input) });

export async function deleteMatch(id: string) {
  await prisma.match.delete({ where: { id } });
}

export interface MatchReportInput {
  appearances: { playerId: string; yellowCards: number; redCards: number }[];
  manOfTheMatchId: string | null;
}

/** A match with its full report: who played, their cards, and the man of the match. */
export async function getMatch(id: string) {
  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      tournament: { select: { id: true, name: true } },
      manOfTheMatch: { select: { id: true, name: true, profilePicUrl: true } },
      appearances: {
        orderBy: { player: { name: "asc" } },
        select: {
          yellowCards: true,
          redCards: true,
          player: { select: { id: true, name: true, jerseyNumber: true, profilePicUrl: true, position: true } },
        },
      },
    },
  });
  if (!match) throw notFound("Match");
  return match;
}

/** Replaces a match's report in one go. Points are recalculated from reports, so they update immediately. */
export async function setMatchReport(id: string, input: MatchReportInput) {
  const match = await prisma.match.findUnique({ where: { id }, select: { id: true } });
  if (!match) throw notFound("Match");

  const playerIds = input.appearances.map((a) => a.playerId);
  const found = await prisma.player.count({ where: { id: { in: playerIds } } });
  if (found !== playerIds.length) throw badRequest("One or more players don't exist");

  await prisma.$transaction([
    prisma.matchAppearance.deleteMany({ where: { matchId: id } }),
    prisma.matchAppearance.createMany({ data: input.appearances.map((a) => ({ ...a, matchId: id })) }),
    prisma.match.update({ where: { id }, data: { manOfTheMatchId: input.manOfTheMatchId } }),
  ]);
  return getMatch(id);
}

import type { MatchResult, Prisma } from "../generated/prisma/client.js";
import { notFound } from "../lib/http-error.js";
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
    include: { matches: { orderBy: matchOrder } },
  });
}

export async function getTournament(id: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id }, include: { matches: { orderBy: matchOrder } } });
  if (!tournament) throw notFound("Tournament");
  return tournament;
}

export const createTournament = (input: TournamentInput) => prisma.tournament.create({ data: input });

export const updateTournament = (id: string, input: Partial<TournamentInput>) =>
  prisma.tournament.update({ where: { id }, data: input });

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
    include: { tournament: { select: { id: true, name: true } } },
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

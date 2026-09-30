import type { Request, Response } from "express";
import { matchListQuery, tournamentListQuery } from "../schemas/index.js";
import * as tournamentService from "../services/tournament.service.js";

type IdParams = Request<{ id: string }>;

export async function list(req: Request, res: Response) {
  res.json(await tournamentService.listTournaments(tournamentListQuery.parse(req.query)));
}

export async function get(req: IdParams, res: Response) {
  res.json(await tournamentService.getTournament(req.params.id));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await tournamentService.createTournament(req.body));
}

export async function update(req: IdParams, res: Response) {
  res.json(await tournamentService.updateTournament(req.params.id, req.body));
}

export async function remove(req: IdParams, res: Response) {
  await tournamentService.deleteTournament(req.params.id);
  res.status(204).end();
}

export async function addMatch(req: IdParams, res: Response) {
  res.status(201).json(await tournamentService.createMatch({ ...req.body, tournamentId: req.params.id }));
}

export async function listMatches(req: Request, res: Response) {
  const query = matchListQuery.parse(req.query);
  res.json(await tournamentService.listMatches({ tournamentId: query.tournamentId, friendliesOnly: query.friendlies }));
}

export async function createMatch(req: Request, res: Response) {
  res.status(201).json(await tournamentService.createMatch(req.body));
}

export async function updateMatch(req: IdParams, res: Response) {
  res.json(await tournamentService.updateMatch(req.params.id, req.body));
}

export async function removeMatch(req: IdParams, res: Response) {
  await tournamentService.deleteMatch(req.params.id);
  res.status(204).end();
}

export async function getMatch(req: IdParams, res: Response) {
  res.json(await tournamentService.getMatch(req.params.id));
}

export async function setMatchReport(req: IdParams, res: Response) {
  res.json(await tournamentService.setMatchReport(req.params.id, req.body));
}

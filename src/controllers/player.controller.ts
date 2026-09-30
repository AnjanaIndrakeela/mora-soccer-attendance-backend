import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth.middleware.js";
import { playerListQuery } from "../schemas/index.js";
import * as playerService from "../services/player.service.js";

export async function list(req: Request, res: Response) {
  res.json(await playerService.listPlayers(playerListQuery.parse(req.query), currentUser(req)));
}

export async function get(req: Request<{ id: string }>, res: Response) {
  res.json(await playerService.getPlayer(req.params.id, currentUser(req)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await playerService.createPlayer(req.body, req.file, currentUser(req)));
}

export async function update(req: Request<{ id: string }>, res: Response) {
  res.json(await playerService.updatePlayer(req.params.id, req.body, req.file, currentUser(req)));
}

export async function remove(req: Request<{ id: string }>, res: Response) {
  await playerService.deactivatePlayer(req.params.id);
  res.status(204).end();
}

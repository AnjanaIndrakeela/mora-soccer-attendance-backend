import type { Request, Response } from "express";
import * as userService from "../services/user.service.js";

export async function listPending(_req: Request, res: Response) {
  res.json(await userService.listPendingClaims());
}

export async function confirm(req: Request<{ id: string }>, res: Response) {
  await userService.confirmClaim(req.params.id);
  res.status(204).end();
}

export async function reject(req: Request<{ id: string }>, res: Response) {
  await userService.rejectClaim(req.params.id);
  res.status(204).end();
}

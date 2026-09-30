import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth.middleware.js";
import { attendPreviewQuery, sessionListQuery } from "../schemas/index.js";
import * as sessionService from "../services/session.service.js";

type IdParams = Request<{ id: string }>;

export async function list(req: Request, res: Response) {
  res.json(await sessionService.listSessions(sessionListQuery.parse(req.query)));
}

export async function get(req: IdParams, res: Response) {
  res.json(await sessionService.getSession(req.params.id));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await sessionService.createSession(req.body, currentUser(req).id));
}

export async function update(req: IdParams, res: Response) {
  res.json(await sessionService.updateSession(req.params.id, req.body));
}

export async function remove(req: IdParams, res: Response) {
  await sessionService.deleteSession(req.params.id);
  res.status(204).end();
}

export async function qr(req: IdParams, res: Response) {
  res.json(await sessionService.getSessionQr(req.params.id));
}

export async function end(req: IdParams, res: Response) {
  res.json(await sessionService.endSession(req.params.id));
}

export async function attendance(req: IdParams, res: Response) {
  res.json(await sessionService.listSessionAttendance(req.params.id));
}

export async function setAttendance(req: IdParams, res: Response) {
  const { playerId, status } = req.body;
  res.json(await sessionService.setPlayerAttendance(req.params.id, playerId, status, currentUser(req).id));
}

export async function approveAll(req: IdParams, res: Response) {
  res.json(await sessionService.approveAllPending(req.params.id, currentUser(req).id));
}

export async function finalize(req: IdParams, res: Response) {
  res.json(await sessionService.finalizeSession(req.params.id));
}

export async function review(req: IdParams, res: Response) {
  res.json(await sessionService.reviewAttendance(req.params.id, req.body.status, currentUser(req).id));
}

export async function attendPreview(req: Request<{ sessionId: string }>, res: Response) {
  const { t } = attendPreviewQuery.parse(req.query);
  res.json(await sessionService.getCheckInPreview(currentUser(req), req.params.sessionId, t));
}

export async function attend(req: Request, res: Response) {
  res.status(201).json(await sessionService.attend(currentUser(req), req.body.sessionId, req.body.token));
}

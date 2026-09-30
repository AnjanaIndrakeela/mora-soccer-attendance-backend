import type { Request, Response } from "express";
import { progressQuery, trendQuery } from "../schemas/index.js";
import * as statsService from "../services/stats.service.js";

export async function dashboard(_req: Request, res: Response) {
  res.json(await statsService.getDashboardStats());
}

export async function attendanceTrend(req: Request, res: Response) {
  res.json(await statsService.getAttendanceTrend(trendQuery.parse(req.query)));
}

export async function progress(req: Request, res: Response) {
  res.json(await statsService.getProgressStats(progressQuery.parse(req.query)));
}

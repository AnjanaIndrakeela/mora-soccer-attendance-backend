import type { Request, Response } from "express";
import { getHealthStatus } from "../services/health.service.js";

export async function getHealth(_req: Request, res: Response) {
  const health = await getHealthStatus();
  res.status(health.status === "ok" ? 200 : 503).json(health);
}

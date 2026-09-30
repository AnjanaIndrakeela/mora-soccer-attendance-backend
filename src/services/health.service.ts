import { prisma } from "../lib/prisma.js";

export interface HealthStatus {
  status: "ok" | "degraded";
  database: "up" | "down";
  uptime: number;
  timestamp: string;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  let database: HealthStatus["database"] = "up";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "down";
  }

  return {
    status: database === "up" ? "ok" : "degraded",
    database,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}

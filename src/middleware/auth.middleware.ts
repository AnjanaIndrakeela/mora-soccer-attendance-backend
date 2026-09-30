import type { NextFunction, Request, Response } from "express";
import type { Role } from "../generated/prisma/client.js";
import { forbidden, unauthorized } from "../lib/http-error.js";
import { AUTH_COOKIE, verifyAuthToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token: string | undefined = req.cookies?.[AUTH_COOKIE];
  const userId = token ? verifyAuthToken(token) : null;
  if (!userId) throw unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, playerId: true, playerConfirmedAt: true },
  });
  if (!user) throw unauthorized();

  req.user = user;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

export const requireAdmin = requireRole("ADMIN");

/** Returns the authenticated user; use in handlers mounted behind requireAuth. */
export function currentUser(req: Request) {
  if (!req.user) throw unauthorized();
  return req.user;
}

import type { Request, Response } from "express";
import { AUTH_COOKIE, authCookieOptions, signAuthToken } from "../lib/jwt.js";
import { currentUser } from "../middleware/auth.middleware.js";
import * as authService from "../services/auth.service.js";

function startSession(res: Response, userId: string) {
  res.cookie(AUTH_COOKIE, signAuthToken(userId), authCookieOptions);
}

export async function register(req: Request, res: Response) {
  const user = await authService.register(req.body);
  startSession(res, user.id);
  res.status(201).json({ user });
}

export async function login(req: Request, res: Response) {
  const user = await authService.login(req.body);
  startSession(res, user.id);
  res.json({ user });
}

export function logout(_req: Request, res: Response) {
  const { maxAge: _maxAge, ...options } = authCookieOptions;
  res.clearCookie(AUTH_COOKIE, options);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  res.json({ user: await authService.getUser(currentUser(req).id) });
}

export async function forgotPassword(req: Request, res: Response) {
  await authService.forgotPassword(req.body.email);
  res.json({ message: "If an account exists for that email, a reset link has been sent." });
}

export async function resetPassword(req: Request, res: Response) {
  await authService.resetPassword(req.body);
  res.json({ message: "Your password has been reset. You can now log in." });
}

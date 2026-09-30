import type { CookieOptions } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const AUTH_COOKIE = "token";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function signAuthToken(userId: string): string {
  return jwt.sign({}, env.jwtSecret, { subject: userId, expiresIn: MAX_AGE_SECONDS });
}

/** Returns the user id, or null if the token is invalid or expired. */
export function verifyAuthToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    return typeof payload === "object" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

// The frontend proxies /api/* to this server, so the cookie is first-party and Lax works.
export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: "lax",
  path: "/",
  maxAge: MAX_AGE_SECONDS * 1000,
};

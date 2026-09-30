import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/** Minutes before start / after end during which scans are still accepted. */
export const SCAN_GRACE_MINUTES = 15;
const GRACE_MS = SCAN_GRACE_MINUTES * 60 * 1000;

export function signQrToken(sessionId: string, endTime: Date): string {
  const exp = Math.floor((endTime.getTime() + GRACE_MS) / 1000);
  return jwt.sign({ exp }, env.qrTokenSecret, { subject: sessionId });
}

export function verifyQrToken(token: string, sessionId: string): boolean {
  try {
    const payload = jwt.verify(token, env.qrTokenSecret);
    return typeof payload === "object" && payload.sub === sessionId;
  } catch {
    return false;
  }
}

export function isWithinScanWindow(session: { startTime: Date; endTime: Date }, now = new Date()): boolean {
  return now.getTime() >= session.startTime.getTime() - GRACE_MS && now.getTime() <= session.endTime.getTime() + GRACE_MS;
}

export function isPastScanWindow(session: { endTime: Date }, now = new Date()): boolean {
  return now.getTime() > session.endTime.getTime() + GRACE_MS;
}

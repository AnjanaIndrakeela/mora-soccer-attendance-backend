import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

const options = {
  windowMs: 15 * 60 * 1000,
  message: { error: "Too many attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === "test",
} as const;

export const loginLimiter = rateLimit({ ...options, limit: 10 });

export const forgotPasswordLimiter = rateLimit({ ...options, limit: 5 });

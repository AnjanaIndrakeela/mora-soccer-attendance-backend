import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../lib/http-error.js";

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    res.status(400).json({ error: details[0]?.message ?? "Invalid request", details });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "Profile picture must be 2 MB or smaller" : err.message;
    res.status(400).json({ error: message });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const meta = JSON.stringify(err.meta ?? {});
      const field = ["indexNo", "email", "sessionId"].find((f) => meta.includes(f));
      const messages: Record<string, string> = {
        indexNo: "A player with this index number already exists",
        email: "An account with this email already exists",
        sessionId: "An attendance record already exists for this player and session",
      };
      res.status(409).json({ error: field ? messages[field] : "A record with this value already exists" });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: "Record not found" });
      return;
    }
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}

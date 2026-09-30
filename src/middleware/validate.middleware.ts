import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

/** Validates and replaces req.body. Query strings are parsed in controllers (req.query is read-only in Express 5). */
export function validateBody(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body);
    next();
  };
}

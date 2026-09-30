import { Router } from "express";
import * as sessions from "../controllers/session.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { attendSchema, reviewSchema } from "../schemas/index.js";

/** Mounted at the root: POST /attend and PATCH /attendance/:id. */
const router = Router();

router.post("/attend", requireAuth, validateBody(attendSchema), sessions.attend);
router.patch("/attendance/:id", requireAuth, requireAdmin, validateBody(reviewSchema), sessions.review);

export default router;

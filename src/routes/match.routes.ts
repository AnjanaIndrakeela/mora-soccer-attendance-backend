import { Router } from "express";
import * as tournaments from "../controllers/tournament.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { matchCreateSchema, matchUpdateSchema } from "../schemas/index.js";

/** Matches outside a tournament (friendlies) and edits to any match. */
const router = Router();

router.use(requireAuth);

router.get("/", tournaments.listMatches);
router.post("/", requireAdmin, validateBody(matchCreateSchema), tournaments.createMatch);
router.patch("/:id", requireAdmin, validateBody(matchUpdateSchema), tournaments.updateMatch);
router.delete("/:id", requireAdmin, tournaments.removeMatch);

export default router;

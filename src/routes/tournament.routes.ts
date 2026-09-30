import { Router } from "express";
import * as tournaments from "../controllers/tournament.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { matchCreateSchema, tournamentCreateSchema, tournamentUpdateSchema } from "../schemas/index.js";

const router = Router();

router.use(requireAuth);

router.get("/", tournaments.list);
router.get("/:id", tournaments.get);
router.post("/", requireAdmin, validateBody(tournamentCreateSchema), tournaments.create);
router.patch("/:id", requireAdmin, validateBody(tournamentUpdateSchema), tournaments.update);
router.delete("/:id", requireAdmin, tournaments.remove);
router.post("/:id/matches", requireAdmin, validateBody(matchCreateSchema.omit({ tournamentId: true })), tournaments.addMatch);

export default router;

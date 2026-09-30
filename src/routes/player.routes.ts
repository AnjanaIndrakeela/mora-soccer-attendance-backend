import { Router } from "express";
import * as players from "../controllers/player.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import { uploadProfilePic } from "../middleware/upload.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { playerCreateSchema, playerUpdateSchema } from "../schemas/index.js";

const router = Router();

router.use(requireAuth);

router.get("/", players.list);
router.get("/:id", players.get);
router.post("/", requireAdmin, uploadProfilePic, validateBody(playerCreateSchema), players.create);
router.patch("/:id", requireAdmin, uploadProfilePic, validateBody(playerUpdateSchema), players.update);
router.delete("/:id", requireAdmin, players.remove);

export default router;

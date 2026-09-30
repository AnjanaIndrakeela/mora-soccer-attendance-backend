import { Router } from "express";
import * as users from "../controllers/user.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/pending", users.listPending);
router.post("/:id/confirm", users.confirm);
router.delete("/:id", users.reject);

export default router;

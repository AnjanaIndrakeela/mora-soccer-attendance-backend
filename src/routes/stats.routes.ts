import { Router } from "express";
import * as stats from "../controllers/stats.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth);

router.get("/dashboard", stats.dashboard);
router.get("/attendance-trend", stats.attendanceTrend);
router.get("/progress", stats.progress);
router.get("/points", stats.points);

export default router;

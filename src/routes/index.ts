import { Router } from "express";
import attendanceRoutes from "./attendance.routes.js";
import authRoutes from "./auth.routes.js";
import healthRoutes from "./health.routes.js";
import matchRoutes from "./match.routes.js";
import playerRoutes from "./player.routes.js";
import sessionRoutes from "./session.routes.js";
import statsRoutes from "./stats.routes.js";
import tournamentRoutes from "./tournament.routes.js";
import userRoutes from "./user.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/players", playerRoutes);
router.use("/sessions", sessionRoutes);
router.use("/tournaments", tournamentRoutes);
router.use("/matches", matchRoutes);
router.use("/stats", statsRoutes);
router.use(attendanceRoutes);

export default router;

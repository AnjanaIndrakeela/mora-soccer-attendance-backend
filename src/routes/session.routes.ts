import { Router } from "express";
import * as sessions from "../controllers/session.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { manualAttendanceSchema, sessionCreateSchema, sessionUpdateSchema } from "../schemas/index.js";

const router = Router();

router.use(requireAuth);

router.get("/", sessions.list);
router.get("/:id", sessions.get);
router.post("/", requireAdmin, validateBody(sessionCreateSchema), sessions.create);
router.patch("/:id", requireAdmin, validateBody(sessionUpdateSchema), sessions.update);
router.delete("/:id", requireAdmin, sessions.remove);
router.get("/:id/qr", requireAdmin, sessions.qr);
router.post("/:id/end", requireAdmin, sessions.end);
router.get("/:id/attendance", requireAdmin, sessions.attendance);
router.post("/:id/attendance", requireAdmin, validateBody(manualAttendanceSchema), sessions.setAttendance);
router.post("/:id/approve-all", requireAdmin, sessions.approveAll);
router.post("/:id/finalize", requireAdmin, sessions.finalize);

export default router;

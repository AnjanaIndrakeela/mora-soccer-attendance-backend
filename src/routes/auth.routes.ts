import { Router } from "express";
import * as auth from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { forgotPasswordLimiter, loginLimiter } from "../middleware/rate-limit.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "../schemas/index.js";

const router = Router();

router.post("/register", loginLimiter, validateBody(registerSchema), auth.register);
router.post("/login", loginLimiter, validateBody(loginSchema), auth.login);
router.post("/logout", auth.logout);
router.get("/me", requireAuth, auth.me);
router.post("/forgot-password", forgotPasswordLimiter, validateBody(forgotPasswordSchema), auth.forgotPassword);
router.post("/reset-password", forgotPasswordLimiter, validateBody(resetPasswordSchema), auth.resetPassword);

export default router;

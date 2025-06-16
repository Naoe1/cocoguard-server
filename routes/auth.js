import express from "express";
import {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
} from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { loginInputSchema, registerInputSchema } from "../schema/authSchema.js";

const router = express.Router();

router.post("/register", validateRequest(registerInputSchema), register);
router.post("/login", validateRequest(loginInputSchema), login);
router.get("/refresh", refreshToken);
router.post("/logout", logout);
router.get("/me", authMiddleware, getCurrentUser);

export default router;

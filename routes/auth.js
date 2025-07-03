import express from "express";
import {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
  forgotPassword,
  updatePassword,
  updateProfile,
} from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { loginInputSchema, registerInputSchema } from "../schema/authSchema.js";

const router = express.Router();

router.post("/register", validateRequest(registerInputSchema), register);
router.post("/login", validateRequest(loginInputSchema), login);
router.post("/forgot", forgotPassword);
router.post("/update-password", updatePassword);
router.get("/refresh", refreshToken);
router.post("/logout", logout);
router.get("/me", authMiddleware, getCurrentUser);
router.patch("/update-profile", authMiddleware, updateProfile);

export default router;

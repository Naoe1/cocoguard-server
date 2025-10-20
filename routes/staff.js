import { Router } from "express";
import {
  createStaff,
  getAllStaff,
  updateStaff,
  deleteStaff,
  getStaffById,
  getStaffCount,
  inviteStaff,
} from "../controllers/staffController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { createStaffSchema, updateStaffSchema } from "../schema/staffSchema.js";

const router = Router();
router.post("/", validateRequest(createStaffSchema), createStaff);
router.get("/", getAllStaff);
router.post("/invite", inviteStaff);
router.get("/count", getStaffCount);
router.get("/:staffId", getStaffById);
router.patch("/:staffId", validateRequest(updateStaffSchema), updateStaff);
router.delete("/:staffId", deleteStaff);

export default router;

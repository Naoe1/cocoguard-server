import express from "express";
import {
  getAllCoconuts,
  getCoconutById,
  createCoconut,
  deleteCoconut,
  updateCoconut,
  getCoconutStatsById,
  checkDisease,
  getCoconuStats,
} from "../controllers/coconutController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { createCoconutSchema } from "../schema/coconutSchema.js";
import { restrictToAdmin } from "../middleware/authMiddleware.js";
import { upload } from "../middleware/multer.js";

const router = express.Router();

router.get("/", getAllCoconuts);
router.get("/stats", getCoconuStats);
router.post("/check-disease", upload.single("image"), checkDisease);
router.get("/:coconutId", getCoconutById);
router.get("/:coconutId/stats", getCoconutStatsById);
router.post("/", validateRequest(createCoconutSchema), createCoconut);
router.patch(
  "/:coconutId",
  restrictToAdmin,
  validateRequest(createCoconutSchema),
  updateCoconut
);

router.delete("/:coconutId", restrictToAdmin, deleteCoconut);

export default router;

import express from "express";
import {
  getAllTreatments,
  getTreatmentById,
  createTreatment,
  updateTreatment,
  deleteTreatment,
} from "../controllers/treatmentController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { createTreatmentSchema } from "../schema/treatmentSchema.js";
import { restrictToAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getAllTreatments);
router.get("/:treatmentId", getTreatmentById);
router.post("/", validateRequest(createTreatmentSchema), createTreatment);
router.patch(
  "/:treatmentId",
  restrictToAdmin,
  validateRequest(createTreatmentSchema),
  updateTreatment
);
router.delete("/:treatmentId", restrictToAdmin, deleteTreatment);

export default router;

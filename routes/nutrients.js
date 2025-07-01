import express from "express";
import {
  getAllNutrients,
  getNutrientById,
  createNutrient,
  updateNutrient,
  deleteNutrient,
} from "../controllers/nutrientController.js";

import { validateRequest } from "../middleware/validateRequest.js";
import { createNutrientSchema } from "../schema/nutrientSchema.js";
import { restrictToAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getAllNutrients);
router.get("/:nutrientId", getNutrientById);
router.post("/", validateRequest(createNutrientSchema), createNutrient);
router.patch(
  "/:nutrientId",
  restrictToAdmin,
  validateRequest(createNutrientSchema),
  updateNutrient
);
router.delete("/:nutrientId", restrictToAdmin, deleteNutrient);

export default router;

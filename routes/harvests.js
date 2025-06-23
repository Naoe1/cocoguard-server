import express from "express";
import {
  getAllHarvests,
  getHarvestById,
  createHarvest,
  updateHarvest,
  deleteHarvest,
  addToInventory,
  getHarvestStats,
} from "../controllers/harvestController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { createHarvestSchema } from "../schema/harvestSchema.js";
import { restrictToAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getAllHarvests);
router.get("/stats", getHarvestStats);
router.get("/:harvestId", getHarvestById);
router.post("/", validateRequest(createHarvestSchema), createHarvest);
router.patch(
  "/:harvestId",
  restrictToAdmin,
  validateRequest(createHarvestSchema),
  updateHarvest
);
router.delete("/:harvestId", restrictToAdmin, deleteHarvest);
router.post("/:harvestId/inventory", addToInventory);

export default router;

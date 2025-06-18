import express from "express";
import {
  getInventory,
  getInventoryItemById,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getLowStockItems,
  addCoconutToInventory,
  getInventoryStats,
} from "../controllers/inventoryController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { createItemSchema } from "../schema/itemSchema.js";
import { restrictToAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getInventory);
router.get("/low-stock", getLowStockItems);
router.get("/stats", getInventoryStats);
router.get("/:inventoryId", getInventoryItemById);
router.patch("/add-to-inventory", addCoconutToInventory);
router.post("/", validateRequest(createItemSchema), createInventoryItem);
router.patch("/:inventoryId", restrictToAdmin, updateInventoryItem);
router.delete("/:inventoryId", restrictToAdmin, deleteInventoryItem);

export default router;

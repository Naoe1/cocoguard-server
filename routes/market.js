import express from "express";
import {
  getAllFarmProducts,
  getProductById,
  createPaypalOrder,
  capturePaypalOrder,
} from "../controllers/marketController.js";

const router = express.Router();
router.post("/:farmId/create-order", createPaypalOrder);
router.post("/:farmId/capture-order", capturePaypalOrder);
router.get("/:farmId", getAllFarmProducts);
router.get("/:farmId/:productId", getProductById);

export default router;

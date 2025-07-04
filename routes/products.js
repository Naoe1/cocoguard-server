import express from "express";
import {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getSalesStats,
  getCopraPriceHistory,
} from "../controllers/productsController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  createProductSchema,
  updateProductSchema,
} from "../schema/productSchema.js";
import { restrictToAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();
router.get("/", getAllProducts);
router.get("/stats", getSalesStats);
router.get("/:productId", getProductById);
router.get("/copra/history", restrictToAdmin, getCopraPriceHistory);
router.post(
  "/",
  restrictToAdmin,
  validateRequest(createProductSchema),
  createProduct
);
router.patch(
  "/:productId",
  restrictToAdmin,
  validateRequest(updateProductSchema),
  updateProduct
);
router.delete("/:productId", restrictToAdmin, deleteProduct);

export default router;

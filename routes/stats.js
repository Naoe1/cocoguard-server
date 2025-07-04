import express from "express";
import { getDashboardStats } from "../controllers/statController.js";

const router = express.Router();

router.get("/", getDashboardStats);

export default router;

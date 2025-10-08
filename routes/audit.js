import express from "express";
import { getAuditEvents } from "../controllers/auditController.js";
import { restrictToAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", restrictToAdmin, getAuditEvents);

export default router;

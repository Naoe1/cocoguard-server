import express from "express";
import { getAuditEvents } from "../controllers/auditController.js";

const router = express.Router();

router.get("/", getAuditEvents);

export default router;

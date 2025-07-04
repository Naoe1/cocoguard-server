import express from "express";
import bodyParser from "body-parser";
import authRoutes from "./routes/auth.js";
import cookieParser from "cookie-parser";
import harvestRoutes from "./routes/harvests.js";
import coconutRoutes from "./routes/coconuts.js";
import inventoryRoutes from "./routes/inventory.js";
import treatmentRoutes from "./routes/treatments.js";
import nutrientRoutes from "./routes/nutrients.js";
import staffRoutes from "./routes/staff.js";
import statRoutes from "./routes/stats.js";
import productRoutes from "./routes/products.js";
import marketRoutes from "./routes/market.js";

import { authMiddleware } from "./middleware/authMiddleware.js";
import cors from "cors";

const app = express();

app.use(bodyParser.json());
app.use(cookieParser());

app.use(cors({ credentials: true, origin: "http://localhost:5173" }));

app.get("/", (req, res) => {
  res.send("CocoGuard API is running");
});

app.use("/api/auth", authRoutes);
app.use("/api/market", marketRoutes);

app.use(authMiddleware);

app.use("/api/coconuts", coconutRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/harvests", harvestRoutes);
app.use("/api/treatments", treatmentRoutes);
app.use("/api/nutrients", nutrientRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/stats", statRoutes);
app.use("/api/products", productRoutes);

app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

app.use((err, req, res, next) => {
  if (res.headerSent) {
    return next(err);
  }
  console.error(err.stack);

  const response = {
    message: err.message || "An unknown error occurred",
  };
  if (err.validationErrors) {
    response.errors = err.validationErrors;
  }

  res.status(err.statusCode || err.code || 500).json(response);
});

app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});

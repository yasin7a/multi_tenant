import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import { createCors } from "./middleware/cors.js";
import healthRoutes from "./routes/health.js";
import internalRoutes from "./routes/internal.js";
import siteRoutes from "./routes/site.js";
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import customDomainRoutes from "./routes/custom-domain.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set("trust proxy", true);

  app.use(createCors());
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(
    "/api/uploads",
    express.static(path.join(__dirname, "..", "public", "uploads")),
  );

  app.use("/api", healthRoutes);
  app.use("/api/internal", internalRoutes);
  app.use("/api", siteRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/profile", profileRoutes);
  app.use("/api/custom-domain", customDomainRoutes);

  return app;
}

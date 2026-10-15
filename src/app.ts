import express, { Request, Response } from "express";
import cors from "cors";
import apiRouter from "./router";
import cookieParser from "cookie-parser";
import { globalErrorHandler } from "./common/error/globalErrorHandler";

const app = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS) || 2);
}

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/v1", apiRouter);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    message: "Route not found",
  });
});

app.use(globalErrorHandler);

export default app;

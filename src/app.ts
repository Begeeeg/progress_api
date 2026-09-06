import express, { Request, Response } from "express";
import cors from "cors";
import apiRouter from "./router";
import cookieParser from "cookie-parser";
import { globalErrorHandler } from "./common/error/globalErrorHandler";

const app = express();

app.use(
    cors({
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        credentials: true,
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/v1", apiRouter);

app.use((req: Request, res: Response) => {
    res.status(404).json({
        message: "Route not found",
    });
});

app.use(globalErrorHandler);

export default app;

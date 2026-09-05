import express from "express";
import cors from "cors";
import apiRouter from "./router";
import cookieParser from "cookie-parser";

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

export default app;

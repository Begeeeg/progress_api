import dotenv from "dotenv";
dotenv.config({ quiet: true });

import jwt from "jsonwebtoken";
import { Response } from "express";

export const generateTokenandSetCookie = (res: Response, userId: string) => {
    const token = jwt.sign({ userId }, process.env.JWT_SECRET!, {
        expiresIn: "1d",
    });

    res.cookie("jwt", token, {
        maxAge: 1 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        secure: process.env.NODE_ENV === "production",
    });
};

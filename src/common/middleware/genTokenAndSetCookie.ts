import dotenv from "dotenv";
dotenv.config({ quiet: true });

import jwt from "jsonwebtoken";
import { Response } from "express";

// Generates the authentication token and stores it in an HTTP-only cookie
// so client-side JavaScript cannot directly access the JWT.
export const generateTokenandSetCookie = (res: Response, userId: string) => {
    // The JWT contains only the user identifier needed to associate
    // authenticated requests with the corresponding user.
    const token = jwt.sign({ userId }, process.env.JWT_SECRET!, {
        expiresIn: "1d",
    });

    // Keep the cookie lifetime aligned with the JWT expiration.
    // `httpOnly` helps reduce token exposure to client-side JavaScript,
    // while the environment-specific settings control cross-site and
    // HTTPS cookie behavior.
    res.cookie("jwt", token, {
        maxAge: 1 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        secure: process.env.NODE_ENV === "production",
    });
};

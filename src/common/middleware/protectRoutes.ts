import type { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

import { ForbiddenError, UnauthorizedError } from "../error/errorStatusCode";
import UserModel from "../../feature/v1/identity/user/user.model";
import AuthModel from "../../feature/v1/identity/auth/auth.model";

interface TokenPayload extends JwtPayload {
    userId: string;
}

export const protectRoutes = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const token = req.cookies?.jwt;
        if (!token) {
            throw new UnauthorizedError("Not authenticated");
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET as string
        ) as TokenPayload;

        const user = await UserModel.findById(decoded.userId).select(
            "-password"
        );

        if (!user) {
            throw new UnauthorizedError("User not found");
        }

        const auth = await AuthModel.findOne({ userId: user._id });
        if (!auth) {
            throw new UnauthorizedError("Auth record not found for user");
        }

        if (!auth.isVerified) {
            throw new ForbiddenError("User is not verified");
        }

        req.user = user;
        next();
    } catch (error) {
        if (error instanceof UnauthorizedError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        console.error("Error in protectRoutes:", error);
        return res.status(401).json({
            error: "Invalid or expired token",
        });
    }
};

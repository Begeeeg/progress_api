import type { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

import {
    AppError,
    UnauthorizedError,
    ForbiddenError,
} from "../error/errorStatusCode";
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
        // Catch any of our own AppError subclasses (UnauthorizedError,
        // ForbiddenError, etc.) generically, rather than only
        // UnauthorizedError — otherwise a legitimate 403 gets misreported
        // as a generic 401 and logged as if it were unexpected.
        if (error instanceof AppError) {
            return res
                .status(error.statusCode)
                .json({ message: error.message });
        }
        console.error("Error in protectRoutes:", error);
        return res.status(401).json({
            message: "Invalid or expired token",
        });
    }
};

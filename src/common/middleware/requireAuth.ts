import type { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { UnauthorizedError } from "../error/errorStatusCode";
import UserModel from "../../feature/v1/identity/user/user.model";

interface TokenPayload extends JwtPayload {
    userId: string;
}

export const requireAuth = async (
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

        const user = await UserModel.findById(decoded.userId);

        if (!user) {
            throw new UnauthorizedError("User not found");
        }

        req.user = user;
        next();
    } catch (error) {
        if (error instanceof UnauthorizedError) {
            return res
                .status(error.statusCode)
                .json({ message: error.message });
        }
        console.error("Error in requireAuth:", error);
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};

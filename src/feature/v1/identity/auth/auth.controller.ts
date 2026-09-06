import { Request, Response } from "express";
import * as authService from "./auth.service";
import { generateTokenandSetCookie } from "../../../../common/middleware/genTokenAndSetCookie";

export const registerController = async (
    req: Request,
    res: Response
): Promise<void> => {
    const user = await authService.registerService(req.body);

    generateTokenandSetCookie(res, user.userId.toString());

    res.status(201).json({
        message: "User created successfully",
        data: user,
    });
};

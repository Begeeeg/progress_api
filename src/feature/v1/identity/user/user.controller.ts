import { Request, Response } from "express";
import * as userService from "./user.service";

export const getUserController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    const user = await userService.getUserService({
        id: req.user._id.toString(),
    });

    res.status(200).json({
        message: "User fetched successfully",
        data: user,
    });
};

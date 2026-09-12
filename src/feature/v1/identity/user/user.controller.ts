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

export const updateUserInfoController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const user = await userService.updateUserInfoService({
        id: req.user._id.toString(),
        username: req.body.username,
        givenname: req.body.givenname,
        surname: req.body.surname,
        password: req.body.password,
    });

    res.status(200).json({
        message: "User info updated successfully",
        data: user,
    });
};

export const updatePasswordController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    await userService.updatePasswordService({
        id: req.user._id.toString(),
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword,
    });

    res.status(200).json({
        message: "Password updated successfully",
    });
};

export const searchUsersController = async (
    req: Request,
    res: Response
): Promise<void> => {
    const query =
        req.query.username || req.query.givenname || req.query.surname;

    if (typeof query !== "string") {
        res.status(400).json({ message: "Invalid search query" });
        return;
    }

    const users = await userService.searchUsersService({ query });

    res.status(200).json({
        message: "Users retrieved successfully",
        data: users,
    });
};

export const deleteUserController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    await userService.deleteUserService({
        id: req.user._id.toString(),
        password: req.body.password,
    });

    res.cookie("jwt", "", {
        maxAge: 0,
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
    });

    res.status(200).json({
        message: "Account deleted successfully",
    });
};

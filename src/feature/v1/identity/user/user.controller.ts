import { Request, Response } from "express";
import * as userService from "./user.service";

/**
 * Retrieves the currently authenticated user's profile information.
 *
 * The user ID is taken from `req.user`, which should have been populated
 * by the authentication middleware rather than supplied by the client.
 */
export const getUserController = async (
    req: Request,
    res: Response
): Promise<void> => {
    // Guard against requests reaching this controller without an authenticated user.
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

/**
 * Updates the authenticated user's profile information.
 *
 * The account ID comes from the authenticated request context, while the
 * editable profile fields and current password come from the request body.
 */
export const updateUserInfoController = async (
    req: Request,
    res: Response
): Promise<void> => {
    // Prevent profile changes when authentication middleware has not
    // attached a user to the request.
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const user = await userService.updateUserInfoService({
        // Never accept the account ID from the client for this operation;
        // use the identity established by the authentication middleware.
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

/**
 * Updates the authenticated user's password after the service validates
 * the current password and the new password requirements.
 */
export const updatePasswordController = async (
    req: Request,
    res: Response
): Promise<void> => {
    // Password changes are restricted to an authenticated account.
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    await userService.updatePasswordService({
        // Use the authenticated user's ID instead of allowing the client
        // to select which account's password should be changed.
        id: req.user._id.toString(),
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword,
    });

    res.status(200).json({
        message: "Password updated successfully",
    });
};

/**
 * Searches for users using one of the supported query parameters.
 *
 * The controller extracts the query parameter while the service performs
 * the actual search and result construction.
 */
export const searchUsersController = async (
    req: Request,
    res: Response
): Promise<void> => {
    // Accept the supported search fields while keeping the search logic
    // itself inside the service layer.
    const query =
        req.query.username || req.query.givenname || req.query.surname;

    // Express query parameters can contain values other than strings,
    // so validate the resolved value before passing it to the service.
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

/**
 * Permanently deletes the authenticated user's account.
 *
 * The current password is required by the service before deletion, and
 * the JWT cookie is cleared after the account has been successfully removed.
 */
export const deleteUserController = async (
    req: Request,
    res: Response
): Promise<void> => {
    // Account deletion must only operate on an authenticated user's account.
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    await userService.deleteUserService({
        // Derive the account identity from the authenticated request rather
        // than accepting an arbitrary user ID from the request body or query.
        id: req.user._id.toString(),
        password: req.body.password,
    });

    // Remove the JWT from the browser after the account has been deleted
    // so the client does not continue sending the previous authentication token.
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

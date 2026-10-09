import { Request, Response } from "express";
import {
    deleteAccountService,
    getAccountService,
    getAccountsService,
} from "./account.service";
import { AccountProvider } from "./types/account.enum";

const isAccountProvider = (provider: unknown): provider is AccountProvider =>
    typeof provider === "string" &&
    Object.values(AccountProvider).some(
        (supportedProvider) => supportedProvider === provider,
    );

export const getAccountsController = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const accounts = await getAccountsService({
        userId: req.user._id.toString(),
    });

    res.status(200).json({
        message: "Fetched accounts successfully",
        data: accounts,
    });
};

export const getAccountController = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const provider = req.params.provider;
    if (!isAccountProvider(provider)) {
        res.status(400).json({ message: "Invalid account provider" });
        return;
    }

    const account = await getAccountService({
        userId: req.user._id.toString(),
        provider,
    });

    res.status(200).json({
        message: "Fetched account successfully",
        data: account,
    });
};

export const deleteAccountController = async (
    req: Request,
    res: Response,
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const provider = req.params.provider;
    if (!isAccountProvider(provider)) {
        res.status(400).json({ message: "Invalid account provider" });
        return;
    }

    await deleteAccountService({
        userId: req.user._id.toString(),
        provider,
    });

    res.status(200).json({
        message: "Account disconnected successfully",
    });
};

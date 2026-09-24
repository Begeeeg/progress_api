import {
    ConflictError,
    NotFoundError,
} from "../../../../common/error/errorStatusCode";
import UserModel from "../user/user.model";
import AccountModel from "./account.model";
import { CreateAccountData } from "./types/account.types";

export const createAccountService = async ({
    userId,
    provider,
    providerAccountId,
    username = null,
    email = null,
    avatarUrl = null,
    profileUrl = null,
    accessToken = null,
    refreshToken = null,
    tokenExpiresAt = null,
    scopes = [],
}: CreateAccountData) => {
    const user = await UserModel.findById(userId).select("_id");

    if (!user) {
        throw new NotFoundError("User not found");
    }

    const existingUserAccount = await AccountModel.findOne({
        userId,
        provider,
    });

    if (existingUserAccount) {
        throw new ConflictError(`${provider} account is already connected`);
    }

    const existingProviderAccount = await AccountModel.findOne({
        provider,
        providerAccountId,
    });

    if (existingProviderAccount) {
        throw new ConflictError(
            "This external account is already connected to another Progress account",
        );
    }

    const account = await AccountModel.create({
        userId,
        provider,
        providerAccountId,
        username,
        email,
        avatarUrl,
        profileUrl,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        scopes,
    });

    return {
        id: account._id,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        username: account.username,
        email: account.email,
        avatarUrl: account.avatarUrl,
        profileUrl: account.profileUrl,
        scopes: account.scopes,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
    };
};

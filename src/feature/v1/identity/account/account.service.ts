import {
    BadRequestError,
    ConflictError,
    NotFoundError,
} from "../../../../common/error/errorStatusCode";
import bcrypt from "bcryptjs";
import AuthModel from "../auth/auth.model";
import UserModel from "../user/user.model";
import AccountModel from "./account.model";
import {
    CreateAccountData,
    DeleteAccountData,
    GetAccountData,
    GetAccountsData,
} from "./types/account.types";

const ACCOUNT_RESPONSE_FIELDS =
    "provider providerAccountId username email avatarUrl profileUrl scopes createdAt updatedAt";

const toAccountResponse = (account: {
    _id: unknown;
    provider: unknown;
    providerAccountId: unknown;
    username: unknown;
    email: unknown;
    avatarUrl: unknown;
    profileUrl: unknown;
    scopes: unknown;
    createdAt: unknown;
    updatedAt: unknown;
}) => ({
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
});

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

export const getAccountsService = async ({ userId }: GetAccountsData) => {
    const accounts = await AccountModel.find({ userId }).select(
        ACCOUNT_RESPONSE_FIELDS,
    );

    return accounts.map(toAccountResponse);
};

export const getPublicAccountsService = async ({ userId }: GetAccountsData) => {
    const accounts = await AccountModel.find({ userId }).select(
        "provider username avatarUrl profileUrl createdAt",
    );

    return accounts.map((account) => ({
        provider: account.provider,
        username: account.username,
        avatarUrl: account.avatarUrl,
        profileUrl: account.profileUrl,
        createdAt: account.createdAt,
    }));
};

export const getAccountService = async ({
    userId,
    provider,
}: GetAccountData) => {
    const account = await AccountModel.findOne({
        userId,
        provider,
    }).select(ACCOUNT_RESPONSE_FIELDS);

    if (!account) {
        throw new NotFoundError(`${provider} account not found`);
    }

    return toAccountResponse(account);
};

export const deleteAccountService = async ({
    userId,
    provider,
    password,
}: DeleteAccountData) => {
    const auth = await AuthModel.findOne({ userId }).select("+password");
    if (!auth) {
        throw new NotFoundError("Auth record not found");
    }

    const isPasswordValid = await bcrypt.compare(password, auth.password);
    if (!isPasswordValid) {
        throw new BadRequestError("Invalid password");
    }

    const account = await AccountModel.findOneAndDelete({
        userId,
        provider,
    });

    if (!account) {
        throw new NotFoundError(`${provider} account not found`);
    }
};

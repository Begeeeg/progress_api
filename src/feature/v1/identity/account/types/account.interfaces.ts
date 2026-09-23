import { Types } from "mongoose";
import { AccountProvider } from "./account.enum";

export interface IAccount {
    userId: Types.ObjectId;

    provider: AccountProvider;
    providerAccountId: string;

    username: string | null;
    email: string | null;
    avatarUrl: string | null;
    profileUrl: string | null;

    accessToken: string | null;
    refreshToken: string | null;
    tokenExpiresAt: Date | null;

    scopes: string[];

    createdAt: Date;
    updatedAt: Date;
}

import { AccountProvider } from "./account.enum";

export interface CreateAccountData {
    userId: string;
    provider: AccountProvider;
    providerAccountId: string;

    username?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    profileUrl?: string | null;

    accessToken?: string | null;
    refreshToken?: string | null;
    tokenExpiresAt?: Date | null;

    scopes?: string[];
}

export interface GetAccountsData {
    userId: string;
}

export interface GetAccountData {
    userId: string;
    provider: AccountProvider;
}

export interface DeleteAccountData {
    userId: string;
    provider: AccountProvider;
}

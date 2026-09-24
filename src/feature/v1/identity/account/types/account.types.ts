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

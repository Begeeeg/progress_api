import * as accountService from "../../identity/account/account.service";
import { AccountProvider } from "../../identity/account/types/account.enum";
import {
    exchangeCodeForAccessToken,
    getGoogleUserInfo,
} from "./google.oauth";
import { ConnectGoogleAccountParams } from "./types/google.types";

export const connectGoogleAccountService = async ({
    userId,
    code,
}: ConnectGoogleAccountParams) => {
    const tokenResponse = await exchangeCodeForAccessToken(code);
    const googleUser = await getGoogleUserInfo(tokenResponse.access_token);

    const scopes = tokenResponse.scope
        ? tokenResponse.scope.split(/\s+/).filter(Boolean)
        : [];
    const tokenExpiresAt = tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000)
        : null;

    return accountService.createAccountService({
        userId,
        provider: AccountProvider.GOOGLE,
        providerAccountId: googleUser.sub,
        username: googleUser.name ?? null,
        email: googleUser.email_verified ? googleUser.email ?? null : null,
        avatarUrl: googleUser.picture ?? null,
        profileUrl: null,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token ?? null,
        tokenExpiresAt,
        scopes,
    });
};

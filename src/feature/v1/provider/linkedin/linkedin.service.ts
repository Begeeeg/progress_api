import * as accountService from "../../identity/account/account.service";
import { AccountProvider } from "../../identity/account/types/account.enum";
import {
    exchangeCodeForAccessToken,
    getLinkedInUserInfo,
} from "./linkedin.oauth";
import { ConnectLinkedInAccountParams } from "./types/linkedin.types";

export const connectLinkedInAccountService = async ({
    userId,
    code,
}: ConnectLinkedInAccountParams) => {
    const tokenResponse = await exchangeCodeForAccessToken(code);
    const linkedInUser = await getLinkedInUserInfo(tokenResponse.access_token);

    const scopes = tokenResponse.scope
        ? tokenResponse.scope.split(/\s+/).filter(Boolean)
        : [];
    const tokenExpiresAt = tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000)
        : null;
    const username =
        linkedInUser.name ??
        [linkedInUser.given_name, linkedInUser.family_name]
            .filter(Boolean)
            .join(" ");

    return accountService.createAccountService({
        userId,
        provider: AccountProvider.LINKEDIN,
        providerAccountId: linkedInUser.sub,
        username: username || null,
        email: linkedInUser.email_verified ? linkedInUser.email ?? null : null,
        avatarUrl: linkedInUser.picture ?? null,
        profileUrl: null,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token ?? null,
        tokenExpiresAt,
        scopes,
    });
};

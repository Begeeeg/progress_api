import * as accountService from "../../identity/account/account.service";
import { AccountProvider } from "../../identity/account/types/account.enum";
import {
    exchangeCodeForAccessToken,
    getFacebookUser,
} from "./facebook.oauth";
import { ConnectFacebookAccountParams } from "./types/facebook.types";

export const connectFacebookAccountService = async ({
    userId,
    code,
}: ConnectFacebookAccountParams) => {
    const tokenResponse = await exchangeCodeForAccessToken(code);
    const facebookUser = await getFacebookUser(tokenResponse.access_token);

    const scopes = tokenResponse.scope
        ? tokenResponse.scope.split(",").map((scope) => scope.trim()).filter(Boolean)
        : [];
    const tokenExpiresAt = tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000)
        : null;
    const username =
        facebookUser.name ??
        (
            [facebookUser.first_name, facebookUser.last_name]
                .filter((name): name is string => Boolean(name))
                .join(" ") || null
        );

    return accountService.createAccountService({
        userId,
        provider: AccountProvider.FACEBOOK,
        providerAccountId: facebookUser.id,
        username: username || null,
        email: facebookUser.email ?? null,
        avatarUrl: facebookUser.picture?.data?.url ?? null,
        profileUrl: facebookUser.link ?? null,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token ?? null,
        tokenExpiresAt,
        scopes,
    });
};

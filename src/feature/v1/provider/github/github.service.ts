import * as accountService from "../../identity/account/account.service";
import { AccountProvider } from "../../identity/account/types/account.enum";
import {
    exchangeCodeForAccessToken,
    getGitHubEmails,
    getGitHubUser,
} from "./github.oauth";
import { ConnectGitHubAccountParams } from "./types/github.types";

export const connectGitHubAccountService = async ({
    userId,
    code,
}: ConnectGitHubAccountParams) => {
    const tokenResponse = await exchangeCodeForAccessToken(code);

    const githubUser = await getGitHubUser(tokenResponse.access_token);

    const githubEmails = await getGitHubEmails(tokenResponse.access_token);

    const primaryVerifiedEmail = githubEmails.find(
        (email) => email.primary && email.verified,
    );

    const email = primaryVerifiedEmail?.email ?? githubUser.email ?? null;

    const scopes = tokenResponse.scope
        ? tokenResponse.scope.split(",").filter(Boolean)
        : [];

    const tokenExpiresAt = tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000)
        : null;

    const github = await accountService.createAccountService({
        userId,
        provider: AccountProvider.GITHUB,
        providerAccountId: githubUser.id.toString(),
        username: githubUser.login,
        email,
        avatarUrl: githubUser.avatar_url,
        profileUrl: githubUser.html_url,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token ?? null,
        tokenExpiresAt,
        scopes,
    });

    return github;
};

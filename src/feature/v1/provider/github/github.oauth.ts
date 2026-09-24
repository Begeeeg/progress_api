import { BadRequestError } from "../../../../common/error/errorStatusCode";
import {
    GitHubAccessTokenResponse,
    GitHubEmailResponse,
    GitHubUserResponse,
} from "./types/github.types";
import {
    getGitHubClientId,
    getGitHubClientSecret,
    GITHUB_API_URL,
    GITHUB_API_VERSION,
    GITHUB_AUTHORIZE_URL,
    GITHUB_CALLBACK_URL,
    GITHUB_TOKEN_URL,
} from "./utils/githubConnect";

export const buildGitHubAuthorizationUrl = (state: string): string => {
    const url = new URL(GITHUB_AUTHORIZE_URL);

    url.searchParams.set("client_id", getGitHubClientId());
    url.searchParams.set("redirect_uri", GITHUB_CALLBACK_URL);
    url.searchParams.set("scope", "read:user user:email");
    url.searchParams.set("state", state);

    return url.toString();
};

export const exchangeCodeForAccessToken = async (
    code: string,
): Promise<GitHubAccessTokenResponse> => {
    const response = await fetch(GITHUB_TOKEN_URL, {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            client_id: getGitHubClientId(),
            client_secret: getGitHubClientSecret(),
            code,
            redirect_uri: GITHUB_CALLBACK_URL,
        }),
    });

    const data = (await response.json()) as
        | GitHubAccessTokenResponse
        | { error: string; error_description?: string };

    if (!response.ok || !("access_token" in data)) {
        throw new BadRequestError("Failed to authenticate with GitHub");
    }

    return data;
};

export const getGitHubUser = async (
    accessToken: string,
): Promise<GitHubUserResponse> => {
    const response = await fetch(`${GITHUB_API_URL}/user`, {
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${accessToken}`,
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
    });

    if (!response.ok) {
        throw new BadRequestError("Failed to retrieve GitHub user");
    }

    return (await response.json()) as GitHubUserResponse;
};

export const getGitHubEmails = async (
    accessToken: string,
): Promise<GitHubEmailResponse[]> => {
    const response = await fetch(`${GITHUB_API_URL}/user/emails`, {
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${accessToken}`,
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
    });

    if (!response.ok) {
        throw new BadRequestError("Failed to retrieve GitHub email addresses");
    }

    return (await response.json()) as GitHubEmailResponse[];
};

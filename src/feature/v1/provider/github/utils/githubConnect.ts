import dotenv from "dotenv";
dotenv.config({ quiet: true });

export const getGitHubClientId = (): string => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
        throw new Error("GITHUB_CLIENT_ID is not configured");
    }

    return clientId;
};

export const getGitHubClientSecret = (): string => {
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientSecret) {
        throw new Error("GITHUB_CLIENT_SECRET is not configured");
    }

    return clientSecret;
};

export const getGitHubAuthorizeUrl = (): string => {
    const authorizeUrl = process.env.GITHUB_AUTHORIZE_URL;

    if (!authorizeUrl) {
        throw new Error("GITHUB_AUTHORIZE_URL is not configured");
    }

    return authorizeUrl;
};

export const getGitHubTokenUrl = (): string => {
    const tokenUrl = process.env.GITHUB_TOKEN_URL;

    if (!tokenUrl) {
        throw new Error("GITHUB_TOKEN_URL is not configured");
    }

    return tokenUrl;
};

export const getGitHubApiUrl = (): string => {
    const apiUrl = process.env.GITHUB_API_URL;

    if (!apiUrl) {
        throw new Error("GITHUB_API_URL is not configured");
    }

    return apiUrl;
};

export const getGitHubApiVersion = (): string => {
    const apiVersion = process.env.GITHUB_API_VERSION;

    if (!apiVersion) {
        throw new Error("GITHUB_API_VERSION is not configured");
    }

    return apiVersion;
};

export const getGitHubCallbackUrl = (): string => {
    const callbackUrl = process.env.GITHUB_CALLBACK_URL;
    if (!callbackUrl) {
        throw new Error("GITHUB_CALLBACK_URL is not configured");
    }

    return callbackUrl;
};

export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_API_URL = "https://api.github.com";
export const GITHUB_API_VERSION = "2026-03-10";
export const GITHUB_CALLBACK_URL =
    "http://localhost:5000/api/v1/identity/account/github/callback";
export const GITHUB_STATE_COOKIE = "github_oauth_state";

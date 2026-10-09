import dotenv from "dotenv";
dotenv.config({ quiet: true });

export const getLinkedInClientId = (): string => {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    if (!clientId) {
        throw new Error("LINKEDIN_CLIENT_ID is not configured");
    }

    return clientId;
};

export const getLinkedInClientSecret = (): string => {
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    if (!clientSecret) {
        throw new Error("LINKEDIN_CLIENT_SECRET is not configured");
    }

    return clientSecret;
};

export const getLinkedInCallbackUrl = (): string =>
    process.env.LINKEDIN_CALLBACK_URL ??
    "http://localhost:5000/api/v1/identity/account/linkedin/callback";

export const LINKEDIN_AUTHORIZE_URL =
    "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_TOKEN_URL =
    "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
export const LINKEDIN_STATE_COOKIE = "linkedin_oauth_state";
export const LINKEDIN_CALLBACK_URL = "http://localhost:5000/api/v1/identity/account/linkedin/callback";

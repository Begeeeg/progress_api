import dotenv from "dotenv";
dotenv.config({ quiet: true });

export const getFacebookClientId = (): string => {
    const clientId = process.env.FACEBOOK_CLIENT_ID;
    if (!clientId) {
        throw new Error("FACEBOOK_CLIENT_ID is not configured");
    }

    return clientId;
};

export const getFacebookClientSecret = (): string => {
    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET;
    if (!clientSecret) {
        throw new Error("FACEBOOK_CLIENT_SECRET is not configured");
    }

    return clientSecret;
};

export const getFacebookCallbackUrl = (): string =>
    process.env.FACEBOOK_CALLBACK_URL ??
    "http://localhost:5000/api/v1/identity/account/facebook/callback";

export const FACEBOOK_AUTHORIZE_URL =
    "https://www.facebook.com/v19.0/dialog/oauth";
export const FACEBOOK_TOKEN_URL =
    "https://graph.facebook.com/v19.0/oauth/access_token";
export const FACEBOOK_GRAPH_URL = "https://graph.facebook.com/v19.0";
export const FACEBOOK_STATE_COOKIE = "facebook_oauth_state";
export const FACEBOOK_CALLBACK_URL = "http://localhost:5000/api/v1/identity/account/facebook/callback";

import dotenv from "dotenv";
dotenv.config({ quiet: true });

export const getGoogleClientId = (): string => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
        throw new Error("GOOGLE_CLIENT_ID is not configured");
    }

    return clientId;
};

export const getGoogleClientSecret = (): string => {
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientSecret) {
        throw new Error("GOOGLE_CLIENT_SECRET is not configured");
    }

    return clientSecret;
};

export const getGoogleCallbackUrl = (): string =>
    process.env.GOOGLE_CALLBACK_URL ??
    "http://localhost:5000/api/v1/identity/account/google/callback";

export const GOOGLE_AUTHORIZE_URL =
    "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL =
    "https://openidconnect.googleapis.com/v1/userinfo";
export const GOOGLE_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_CALLBACK_URL = "http://localhost:5000/api/v1/identity/account/google/callback";
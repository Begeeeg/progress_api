import { BadRequestError } from "../../../../common/error/errorStatusCode";
import {
    GoogleAccessTokenResponse,
    GoogleUserInfoResponse,
} from "./types/google.types";
import {
    getGoogleCallbackUrl,
    getGoogleClientId,
    getGoogleClientSecret,
    GOOGLE_AUTHORIZE_URL,
    GOOGLE_TOKEN_URL,
    GOOGLE_USERINFO_URL,
} from "./utils/googleConnect";

export const buildGoogleAuthorizationUrl = (state: string): string => {
    const url = new URL(GOOGLE_AUTHORIZE_URL);

    url.searchParams.set("client_id", getGoogleClientId());
    url.searchParams.set("redirect_uri", getGoogleCallbackUrl());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");

    return url.toString();
};

export const exchangeCodeForAccessToken = async (
    code: string,
): Promise<GoogleAccessTokenResponse> => {
    const body = new URLSearchParams({
        client_id: getGoogleClientId(),
        client_secret: getGoogleClientSecret(),
        code,
        grant_type: "authorization_code",
        redirect_uri: getGoogleCallbackUrl(),
    });
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });

    const data = (await response.json()) as
        | GoogleAccessTokenResponse
        | { error: string };

    if (
        !response.ok ||
        !("access_token" in data) ||
        typeof data.access_token !== "string"
    ) {
        throw new BadRequestError("Failed to authenticate with Google");
    }

    return data;
};

export const getGoogleUserInfo = async (
    accessToken: string,
): Promise<GoogleUserInfoResponse> => {
    const response = await fetch(GOOGLE_USERINFO_URL, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new BadRequestError("Failed to retrieve Google user");
    }

    const userInfo = (await response.json()) as GoogleUserInfoResponse;
    if (typeof userInfo.sub !== "string" || userInfo.sub.length === 0) {
        throw new BadRequestError("Invalid Google user response");
    }

    return userInfo;
};

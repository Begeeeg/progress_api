import { BadRequestError } from "../../../../common/error/errorStatusCode";
import {
    LinkedInAccessTokenResponse,
    LinkedInUserInfoResponse,
} from "./types/linkedin.types";
import {
    getLinkedInCallbackUrl,
    getLinkedInClientId,
    getLinkedInClientSecret,
    LINKEDIN_AUTHORIZE_URL,
    LINKEDIN_TOKEN_URL,
    LINKEDIN_USERINFO_URL,
} from "./utils/linkedinConnect";

export const buildLinkedInAuthorizationUrl = (state: string): string => {
    const url = new URL(LINKEDIN_AUTHORIZE_URL);

    url.searchParams.set("client_id", getLinkedInClientId());
    url.searchParams.set("redirect_uri", getLinkedInCallbackUrl());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid profile email");
    url.searchParams.set("state", state);

    return url.toString();
};

export const exchangeCodeForAccessToken = async (
    code: string,
): Promise<LinkedInAccessTokenResponse> => {
    const body = new URLSearchParams({
        client_id: getLinkedInClientId(),
        client_secret: getLinkedInClientSecret(),
        code,
        grant_type: "authorization_code",
        redirect_uri: getLinkedInCallbackUrl(),
    });
    const response = await fetch(LINKEDIN_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });

    const data = (await response.json()) as
        | LinkedInAccessTokenResponse
        | { error: string };

    if (
        !response.ok ||
        !("access_token" in data) ||
        typeof data.access_token !== "string"
    ) {
        throw new BadRequestError("Failed to authenticate with LinkedIn");
    }

    return data;
};

export const getLinkedInUserInfo = async (
    accessToken: string,
): Promise<LinkedInUserInfoResponse> => {
    const response = await fetch(LINKEDIN_USERINFO_URL, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new BadRequestError("Failed to retrieve LinkedIn user");
    }

    const userInfo = (await response.json()) as LinkedInUserInfoResponse;
    if (typeof userInfo.sub !== "string" || userInfo.sub.length === 0) {
        throw new BadRequestError("Invalid LinkedIn user response");
    }

    return userInfo;
};

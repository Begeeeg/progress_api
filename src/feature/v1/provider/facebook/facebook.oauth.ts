import { BadRequestError } from "../../../../common/error/errorStatusCode";
import {
    FacebookAccessTokenResponse,
    FacebookUserResponse,
} from "./types/facebook.types";
import {
    FACEBOOK_AUTHORIZE_URL,
    FACEBOOK_GRAPH_URL,
    FACEBOOK_TOKEN_URL,
    getFacebookCallbackUrl,
    getFacebookClientId,
    getFacebookClientSecret,
} from "./utils/facebookConnect";

export const buildFacebookAuthorizationUrl = (state: string): string => {
    const url = new URL(FACEBOOK_AUTHORIZE_URL);

    url.searchParams.set("client_id", getFacebookClientId());
    url.searchParams.set("redirect_uri", getFacebookCallbackUrl());
    url.searchParams.set("scope", "email,public_profile");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);

    return url.toString();
};

export const exchangeCodeForAccessToken = async (
    code: string,
): Promise<FacebookAccessTokenResponse> => {
    const body = new URLSearchParams({
        client_id: getFacebookClientId(),
        client_secret: getFacebookClientSecret(),
        code,
        redirect_uri: getFacebookCallbackUrl(),
    });

    const response = await fetch(FACEBOOK_TOKEN_URL, {
        method: "POST",
        headers: {
            Accept: "application/json",
        },
        body,
    });

    const data = (await response.json()) as
        | FacebookAccessTokenResponse
        | { error: { message: string } };

    if (
        !response.ok ||
        !("access_token" in data) ||
        typeof data.access_token !== "string"
    ) {
        throw new BadRequestError("Failed to authenticate with Facebook");
    }

    return data;
};

export const getFacebookUser = async (
    accessToken: string,
): Promise<FacebookUserResponse> => {
    const url = new URL(`${FACEBOOK_GRAPH_URL}/me`);
    url.searchParams.set("fields", "id,name,email,picture{url},link");

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new BadRequestError("Failed to retrieve Facebook user");
    }

    const user = (await response.json()) as FacebookUserResponse;

    if (typeof user.id !== "string" || user.id.length === 0) {
        throw new BadRequestError("Invalid Facebook user response");
    }

    return user;
};

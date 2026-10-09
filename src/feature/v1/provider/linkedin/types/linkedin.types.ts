export interface LinkedInAccessTokenResponse {
    access_token: string;
    token_type: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    scope?: string;
}

export interface LinkedInUserInfoResponse {
    sub: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    email?: string;
    email_verified?: boolean;
    picture?: string;
}

export interface ConnectLinkedInAccountParams {
    userId: string;
    code: string;
}

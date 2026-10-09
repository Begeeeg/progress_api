export interface FacebookAccessTokenResponse {
    access_token: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
    refresh_token?: string;
}

export interface FacebookPictureData {
    url?: string;
}

export interface FacebookPicture {
    data?: FacebookPictureData;
}

export interface FacebookUserResponse {
    id: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    email?: string | null;
    link?: string | null;
    picture?: FacebookPicture;
}

export interface ConnectFacebookAccountParams {
    userId: string;
    code: string;
}

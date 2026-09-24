export interface GitHubAccessTokenResponse {
    access_token: string;
    token_type: string;
    scope: string;

    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
}

export interface GitHubUserResponse {
    id: number;
    login: string;
    avatar_url: string;
    html_url: string;
    email: string | null;
}

export interface GitHubEmailResponse {
    email: string;
    primary: boolean;
    verified: boolean;
    visibility: string | null;
}

export interface ConnectGitHubAccountParams {
    userId: string;
    code: string;
}

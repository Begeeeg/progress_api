export interface GetUserData {
    id: string;
}

export interface UpdateUserInfoData {
    id: string;
    username?: string;
    givenname?: string;
    surname?: string;
    password: string;
}

export interface UpdateUserPasswordData {
    id: string;
    currentPassword: string;
    newPassword: string;
}

export interface SearchUsersData {
    query: string;
}

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

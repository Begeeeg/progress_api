export interface IUser {
    username: string;
    givenname: string;
    surname: string;
    email: string;
    avatarUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}

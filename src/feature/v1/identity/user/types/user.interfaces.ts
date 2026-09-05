export interface IUser {
    username: string;
    givenname: string;
    surname: string;
    email: string;
    githubAccount: string;
    avatarUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}

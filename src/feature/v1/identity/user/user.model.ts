import { Schema, model, Document } from "mongoose";
import { IUser } from "./types/user.interfaces";

export type UserDocument = IUser & Document;

const UserSchema = new Schema<UserDocument>(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 3,
        },
        givenname: {
            type: String,
            required: true,
            trim: true,
            minlength: 3,
        },
        surname: {
            type: String,
            required: true,
            trim: true,
            minlength: 3,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        githubAccount: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        avatarUrl: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

const UserModel = model<UserDocument>("User", UserSchema);

export default UserModel;

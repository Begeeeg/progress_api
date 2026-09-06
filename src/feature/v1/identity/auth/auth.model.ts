import { Schema, model, Document } from "mongoose";
import { IAuth } from "./types/auth.interfaces";

export type AuthDocument = IAuth & Document;

const AuthSchema = new Schema<AuthDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },
        password: {
            type: String,
            required: true,
            select: false,
        },
        isOnline: {
            type: Boolean,
            default: false,
        },
        lastLogin: {
            type: Date,
            default: null,
        },
        lastLogout: {
            type: Date,
            default: null,
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        unverifiedExpiresAt: {
            type: Date,
            default: null,
        },
        verificationToken: {
            type: String,
            default: null,
            select: false,
        },
        verificationTokenExpiry: {
            type: Date,
            default: null,
            select: false,
        },
    },
    {
        timestamps: true,
    }
);

const AuthModel = model<AuthDocument>("Auth", AuthSchema);

export default AuthModel;

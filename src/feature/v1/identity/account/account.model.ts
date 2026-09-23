import { Document, model, Schema } from "mongoose";
import { AccountProvider } from "./types/account.enum";
import { IAccount } from "./types/account.interfaces";

export type AccountDocument = IAccount & Document;

const AccountSchema = new Schema<AccountDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        provider: {
            type: String,
            enum: Object.values(AccountProvider),
            required: true,
        },

        providerAccountId: {
            type: String,
            required: true,
        },

        username: {
            type: String,
            default: null,
        },

        email: {
            type: String,
            default: null,
        },

        avatarUrl: {
            type: String,
            default: null,
        },

        profileUrl: {
            type: String,
            default: null,
        },

        accessToken: {
            type: String,
            default: null,
            select: false,
        },

        refreshToken: {
            type: String,
            default: null,
            select: false,
        },

        tokenExpiresAt: {
            type: Date,
            default: null,
            select: false,
        },

        scopes: {
            type: [String],
            default: [],
        },
    },
    {
        timestamps: true,
    },
);

AccountSchema.index(
    {
        userId: 1,
        provider: 1,
    },
    {
        unique: true,
    },
);

AccountSchema.index(
    {
        provider: 1,
        providerAccountId: 1,
    },
    {
        unique: true,
    },
);

const AccountModel = model<AccountDocument>("Account", AccountSchema);

export default AccountModel;

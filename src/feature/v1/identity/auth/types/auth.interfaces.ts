import { Types } from "mongoose";

export interface IAuth {
    userId: Types.ObjectId;
    password: string;
    isOnline: boolean;
    lastLogin: Date | null;
    lastLogout: Date | null;
    isVerified: boolean;
    unverifiedExpiresAt: Date | null;
    verificationToken: string | null;
    verificationTokenExpiry: Date | null;
}

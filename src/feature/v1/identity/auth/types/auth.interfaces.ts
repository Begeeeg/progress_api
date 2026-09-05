import { Types } from "mongoose";

export interface IAuth {
    userId: Types.ObjectId;
    hashedPassword: string;
    isOnline: boolean;
    lastLogin: Date | null;
    lastLogout: Date | null;
    isVerified: boolean;
    unverifiedExpiresAt: Date | null;
    verificationToken: string | null;
    verificationTokenExpiry: Date | null;
}

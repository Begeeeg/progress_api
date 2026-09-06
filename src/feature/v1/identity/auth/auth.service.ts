import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
    BadRequestError,
    ConflictError,
} from "../../../../common/error/errorStatusCode";
import { RegisterData } from "./types/auth.types";
import UserModel from "../user/user.model";
import AuthModel from "./auth.model";
import { sendVerificationEmail } from "../../../../common/utils/sendVerificationEmail";
import { sendWelcomeEmail } from "../../../../common/utils/sendWelcomeEmail";

export const registerService = async ({
    username,
    givenname,
    surname,
    email,
    password,
}: RegisterData) => {
    const session = await mongoose.startSession();
    let user;
    let auth;
    let verificationToken: string;

    try {
        session.startTransaction();

        const existing = await UserModel.findOne({
            $or: [{ username }, { email }],
        }).session(session);

        if (existing) {
            if (existing.username === username) {
                throw new ConflictError("Username already exists");
            }
            throw new ConflictError("Email already exists");
        }

        const hashPassword = await bcrypt.hash(password, 10);
        verificationToken = crypto.randomBytes(32).toString("hex");
        const verificationTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

        const lastLogin = new Date();
        const isOnline = true;
        const isVerified = false;
        const unverifiedExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        [user] = await UserModel.create(
            [
                {
                    username,
                    givenname,
                    surname,
                    email,
                },
            ],
            { session }
        );

        [auth] = await AuthModel.create(
            [
                {
                    userId: user._id,
                    password: hashPassword,
                    isOnline,
                    lastLogin,
                    verificationToken,
                    verificationTokenExpiry,
                    isVerified,
                    unverifiedExpiresAt,
                },
            ],
            { session }
        );

        await session.commitTransaction();
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }

    try {
        await sendVerificationEmail(email, username, verificationToken);
    } catch (error) {
        console.error("Failed to send verification email:", error);
    }

    return {
        userId: user._id,
        username: user.username,
        givenname: user.givenname,
        surname: user.surname,
        email: user.email,
        isOnline: auth.isOnline,
        isVerified: auth.isVerified,
    };
};

export const verifyEmailService = async (token: string) => {
    const auth = await AuthModel.findOne({
        verificationToken: token,
    }).select("+verificationToken +verificationTokenExpiry");
    if (!auth) {
        throw new BadRequestError("Invalid or expired verification token");
    }
    if (
        !auth.verificationTokenExpiry ||
        auth.verificationTokenExpiry < new Date()
    ) {
        throw new BadRequestError("Verification token has expired");
    }
    auth.isVerified = true;
    auth.unverifiedExpiresAt = null;
    auth.verificationToken = null;
    auth.verificationTokenExpiry = null;
    await auth.save();

    const user = await UserModel.findById(auth.userId);

    if (user?.email) {
        sendWelcomeEmail(user.email, user.username).catch((err) =>
            console.error("Failed to send welcome email:", err)
        );
    }

    return {
        username: user?.username,
        isVerified: auth.isVerified,
    };
};

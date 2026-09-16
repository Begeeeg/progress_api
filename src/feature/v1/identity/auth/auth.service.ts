import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
    BadRequestError,
    ConflictError,
    NotFoundError,
} from "../../../../common/error/errorStatusCode";
import { LoginData, RegisterData } from "./types/auth.types";
import UserModel from "../user/user.model";
import AuthModel from "./auth.model";
import { sendVerificationEmail } from "../../../../common/utils/sendVerificationEmail";
import { sendWelcomeEmail } from "../../../../common/utils/sendWelcomeEmail";

/**
 * Registers a new user and creates the corresponding authentication record
 * as one database transaction.
 *
 * Passwords are hashed before persistence, while email verification uses
 * a cryptographically random token with a limited validity period.
 */
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

    try {
        // User and authentication records must be created together so a
        // partial registration cannot leave an account in an inconsistent state.
        session.startTransaction();

        const existing = await UserModel.findOne({
            $or: [{ username }, { email }],
        }).session(session);

        if (existing) {
            // Keep username and email conflicts distinguishable so clients
            // can receive the appropriate validation message.
            if (existing.username === username) {
                throw new ConflictError("Username already exists");
            }
            throw new ConflictError("Email already exists");
        }

        // Store only the password hash; the plaintext password must never
        // be persisted or included in the authentication record.
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate an unpredictable verification token and limit its
        // validity to reduce the impact of token exposure.
        const verificationToken = crypto.randomBytes(32).toString("hex");
        const verificationTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

        const lastLogin = new Date();
        const isOnline = true;

        // This separate expiration controls how long an unverified account
        // can remain in the system before the cleanup process removes it.
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
                    password: hashedPassword,
                    isOnline,
                    lastLogin,
                    verificationToken,
                    verificationTokenExpiry,
                    unverifiedExpiresAt,
                },
            ],
            { session }
        );

        // Commit before sending the email so the verification link is only
        // sent after the account records have been successfully persisted.
        await session.commitTransaction();

        await sendVerificationEmail(email, username, verificationToken);
    } catch (error) {
        // Roll back both records when any database operation in the
        // registration transaction fails.
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
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

/**
 * Verifies a user's email using the token issued during registration
 * or through the resend-verification flow.
 *
 * A successful verification activates the account and invalidates the
 * token so it cannot be reused.
 */
export const verifyEmailService = async (token: string) => {
    // Select the normally hidden verification fields because they are
    // required to validate the supplied token and its expiration.
    const auth = await AuthModel.findOne({
        verificationToken: token,
    }).select("+verificationToken +verificationTokenExpiry");

    if (
        !auth ||
        !auth.verificationTokenExpiry ||
        auth.verificationTokenExpiry < new Date()
    ) {
        throw new BadRequestError("Invalid or expired verification token");
    }

    const user = await UserModel.findById(auth.userId);
    if (!user) {
        throw new NotFoundError("User not found");
    }

    // Clear the verification credentials after successful use to make
    // the verification token effectively single-use.
    auth.isVerified = true;
    auth.unverifiedExpiresAt = null;
    auth.verificationToken = null;
    auth.verificationTokenExpiry = null;
    await auth.save();

    // The welcome email is sent only after the account has been marked verified.
    await sendWelcomeEmail(user.email, user.username);
};

/**
 * Generates and sends a new verification token for an existing
 * unverified account.
 */
export const resendVerificationService = async (email: string) => {
    const user = await UserModel.findOne({ email });

    if (!user) {
        throw new BadRequestError("User not found");
    }

    const auth = await AuthModel.findOne({ userId: user._id });

    if (!auth || auth.isVerified) {
        throw new BadRequestError("User is already verified or not found");
    }

    // Generate a fresh token and expiration instead of extending the
    // lifetime of the previous verification credential.
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

    auth.verificationToken = verificationToken;
    auth.verificationTokenExpiry = verificationTokenExpiry;
    await auth.save();

    await sendVerificationEmail(email, user.username, verificationToken);
};

/**
 * Marks the authenticated user's session state as offline and records
 * when the logout operation occurred.
 */
export const logOutService = async (userId: string) => {
    const user = await UserModel.findById(userId);

    if (!user) {
        throw new NotFoundError("User not found");
    }

    await AuthModel.findOneAndUpdate(
        { userId },
        { isOnline: false, lastLogout: new Date() },
        { returnDocument: "after" }
    );
};

/**
 * Authenticates a user using their email and password and updates
 * the account's login state after successful credential validation.
 */
export const logInService = async ({ email, password }: LoginData) => {
    const user = await UserModel.findOne({
        email,
    });

    if (!user) {
        // Use the same response for unknown emails and incorrect passwords
        // to avoid revealing whether an account exists.
        throw new BadRequestError("Invalid email or password");
    }

    // Password is excluded by default from the authentication document,
    // so it must be explicitly selected only for credential verification.
    const auth = await AuthModel.findOne({ userId: user._id }).select(
        "+password"
    );

    if (!auth) {
        throw new BadRequestError("Invalid email or password");
    }

    const isPasswordValid = await bcrypt.compare(password, auth.password);

    if (!isPasswordValid) {
        // Keep credential failures indistinguishable from an unknown email
        // to reduce account-enumeration risk.
        throw new BadRequestError("Invalid email or password");
    }

    // Update login state only after the password has been successfully verified.
    const updatedAuth = await AuthModel.findOneAndUpdate(
        { userId: user._id },
        { isOnline: true, lastLogin: new Date() },
        { returnDocument: "after" }
    );

    return {
        userId: user._id,
        username: user.username,
        givenname: user.givenname,
        surname: user.surname,
        email: user.email,
        isOnline: updatedAuth?.isOnline,
        isVerified: updatedAuth?.isVerified,
    };
};

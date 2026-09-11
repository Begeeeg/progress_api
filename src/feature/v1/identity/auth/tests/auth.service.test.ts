import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// --- Mock dependencies before importing the service ---
vi.mock("../../user/user.model", () => ({
    default: {
        findOne: vi.fn(),
        findById: vi.fn(),
        create: vi.fn(),
    },
}));

vi.mock("../auth.model", () => ({
    default: {
        findOne: vi.fn(),
        findOneAndUpdate: vi.fn(),
        create: vi.fn(),
    },
}));

vi.mock("../../../../../common/utils/sendVerificationEmail", () => ({
    sendVerificationEmail: vi.fn(),
}));

vi.mock("../../../../../common/utils/sendWelcomeEmail", () => ({
    sendWelcomeEmail: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
    default: {
        hash: vi.fn(),
        compare: vi.fn(),
    },
}));

vi.mock("crypto", () => ({
    default: {
        randomBytes: vi.fn(() => ({
            toString: () => "mocked-token",
        })),
    },
}));

import UserModel from "../../user/user.model";
import AuthModel from "../auth.model";
import { sendVerificationEmail } from "../../../../../common/utils/sendVerificationEmail";
import { sendWelcomeEmail } from "../../../../../common/utils/sendWelcomeEmail";
import {
    registerService,
    verifyEmailService,
    resendVerificationService,
    logOutService,
    logInService,
} from "../auth.service";
import {
    BadRequestError,
    ConflictError,
    NotFoundError,
} from "../../../../../common/error/errorStatusCode";

// Mock a mongoose session so registerService's transaction logic works
const mockSession = {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    abortTransaction: vi.fn(),
    endSession: vi.fn(),
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(mongoose, "startSession").mockResolvedValue(mockSession as any);
});

describe("auth.service", () => {
    describe("registerService", () => {
        const input = {
            username: "johndoe",
            givenname: "John",
            surname: "Doe",
            email: "john@gmail.com",
            password: "Password1",
        };

        it("creates a user and auth record, sends verification email", async () => {
            (UserModel.findOne as any).mockReturnValue({
                session: vi.fn().mockResolvedValue(null),
            });

            const createdUser = { _id: "user123", ...input };
            const createdAuth = { isOnline: true, isVerified: false };

            (UserModel.create as any).mockResolvedValue([createdUser]);
            (AuthModel.create as any).mockResolvedValue([createdAuth]);
            (bcrypt.hash as any).mockResolvedValue("hashedPassword");

            const result = await registerService(input);

            expect(UserModel.create).toHaveBeenCalledWith(
                [
                    {
                        username: input.username,
                        givenname: input.givenname,
                        surname: input.surname,
                        email: input.email,
                    },
                ],
                { session: mockSession }
            );
            expect(AuthModel.create).toHaveBeenCalled();
            expect(mockSession.commitTransaction).toHaveBeenCalled();
            expect(sendVerificationEmail).toHaveBeenCalledWith(
                input.email,
                input.username,
                "mocked-token"
            );
            expect(result).toEqual({
                userId: createdUser._id,
                username: createdUser.username,
                givenname: createdUser.givenname,
                surname: createdUser.surname,
                email: createdUser.email,
                isOnline: createdAuth.isOnline,
                isVerified: createdAuth.isVerified,
            });
        });

        it("throws ConflictError when username already exists", async () => {
            (UserModel.findOne as any).mockReturnValue({
                session: vi.fn().mockResolvedValue({
                    username: input.username,
                    email: "x@gmail.com",
                }),
            });

            await expect(registerService(input)).rejects.toThrow(ConflictError);
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        it("throws ConflictError when email already exists", async () => {
            (UserModel.findOne as any).mockReturnValue({
                session: vi.fn().mockResolvedValue({
                    username: "someoneelse",
                    email: input.email,
                }),
            });

            await expect(registerService(input)).rejects.toThrow(ConflictError);
            expect(mockSession.abortTransaction).toHaveBeenCalled();
        });

        it("aborts the transaction and rethrows on unexpected errors", async () => {
            (UserModel.findOne as any).mockReturnValue({
                session: vi.fn().mockResolvedValue(null),
            });
            (bcrypt.hash as any).mockResolvedValue("hashedPassword");
            (UserModel.create as any).mockRejectedValue(new Error("db down"));

            await expect(registerService(input)).rejects.toThrow("db down");
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });
    });

    describe("verifyEmailService", () => {
        it("verifies email and sends welcome email when token valid", async () => {
            const auth = {
                verificationToken: "valid-token",
                verificationTokenExpiry: new Date(Date.now() + 60_000),
                userId: "user123",
                isVerified: false,
                unverifiedExpiresAt: new Date(),
                save: vi.fn().mockResolvedValue(true),
            };
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue(auth),
            });
            (UserModel.findById as any).mockResolvedValue({
                _id: "user123",
                email: "john@gmail.com",
                username: "johndoe",
            });

            await verifyEmailService("valid-token");

            expect(auth.isVerified).toBe(true);
            expect(auth.unverifiedExpiresAt).toBeNull();
            expect(auth.verificationToken).toBeNull();
            expect(auth.verificationTokenExpiry).toBeNull();
            expect(auth.save).toHaveBeenCalled();
            expect(sendWelcomeEmail).toHaveBeenCalledWith(
                "john@gmail.com",
                "johndoe"
            );
        });

        it("throws BadRequestError when token not found", async () => {
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue(null),
            });

            await expect(verifyEmailService("bad-token")).rejects.toThrow(
                BadRequestError
            );
        });

        it("throws BadRequestError when token expired", async () => {
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue({
                    verificationToken: "token",
                    verificationTokenExpiry: new Date(Date.now() - 60_000),
                }),
            });

            await expect(verifyEmailService("token")).rejects.toThrow(
                BadRequestError
            );
        });

        it("throws NotFoundError when user missing", async () => {
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue({
                    verificationToken: "token",
                    verificationTokenExpiry: new Date(Date.now() + 60_000),
                    userId: "missing",
                }),
            });
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(verifyEmailService("token")).rejects.toThrow(
                NotFoundError
            );
        });
    });

    describe("resendVerificationService", () => {
        it("regenerates token and resends verification email", async () => {
            const user = { _id: "user123", username: "johndoe" };
            const auth: {
                isVerified: boolean;
                save: () => Promise<boolean>;
                verificationToken?: string;
                verificationTokenExpiry?: Date;
            } = {
                isVerified: false,
                save: vi.fn().mockResolvedValue(true),
            };
            (UserModel.findOne as any).mockResolvedValue(user);
            (AuthModel.findOne as any).mockResolvedValue(auth);

            await resendVerificationService("john@gmail.com");

            expect(auth.verificationToken).toBe("mocked-token");
            expect(auth.save).toHaveBeenCalled();
            expect(sendVerificationEmail).toHaveBeenCalledWith(
                "john@gmail.com",
                "johndoe",
                "mocked-token"
            );
        });

        it("throws BadRequestError when user not found", async () => {
            (UserModel.findOne as any).mockResolvedValue(null);

            await expect(
                resendVerificationService("missing@gmail.com")
            ).rejects.toThrow(BadRequestError);
        });

        it("throws BadRequestError when already verified", async () => {
            (UserModel.findOne as any).mockResolvedValue({ _id: "user123" });
            (AuthModel.findOne as any).mockResolvedValue({ isVerified: true });

            await expect(
                resendVerificationService("john@gmail.com")
            ).rejects.toThrow(BadRequestError);
        });
    });

    describe("logOutService", () => {
        it("updates isOnline and lastLogout", async () => {
            (UserModel.findById as any).mockResolvedValue({ _id: "user123" });
            (AuthModel.findOneAndUpdate as any).mockResolvedValue({});

            await logOutService("user123");

            expect(AuthModel.findOneAndUpdate).toHaveBeenCalledWith(
                { userId: "user123" },
                expect.objectContaining({ isOnline: false })
            );
        });

        it("throws NotFoundError when user missing", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(logOutService("missing")).rejects.toThrow(
                NotFoundError
            );
        });
    });

    describe("logInService", () => {
        const credentials = { email: "john@gmail.com", password: "Password1" };

        it("logs in successfully with correct credentials", async () => {
            const user = {
                _id: "user123",
                username: "johndoe",
                givenname: "John",
                surname: "Doe",
                email: "john@gmail.com",
            };
            (UserModel.findOne as any).mockResolvedValue(user);
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue({ password: "hashed" }),
            });
            (bcrypt.compare as any).mockResolvedValue(true);
            (AuthModel.findOneAndUpdate as any).mockResolvedValue({
                isOnline: true,
                isVerified: true,
            });

            const result = await logInService(credentials);

            expect(result.userId).toBe(user._id);
            expect(result.isOnline).toBe(true);
        });

        it("throws BadRequestError when user not found", async () => {
            (UserModel.findOne as any).mockResolvedValue(null);

            await expect(logInService(credentials)).rejects.toThrow(
                BadRequestError
            );
        });

        it("throws BadRequestError when auth record missing", async () => {
            (UserModel.findOne as any).mockResolvedValue({ _id: "user123" });
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue(null),
            });

            await expect(logInService(credentials)).rejects.toThrow(
                BadRequestError
            );
        });

        it("throws BadRequestError when password invalid", async () => {
            (UserModel.findOne as any).mockResolvedValue({ _id: "user123" });
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue({ password: "hashed" }),
            });
            (bcrypt.compare as any).mockResolvedValue(false);

            await expect(logInService(credentials)).rejects.toThrow(
                BadRequestError
            );
        });
    });
});

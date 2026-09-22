import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextFunction, Request, Response } from "express";

vi.mock("jsonwebtoken", () => ({
    default: {
        verify: vi.fn(),
    },
}));

vi.mock("../auth.service", () => ({
    registerService: vi.fn(),
    verifyEmailService: vi.fn(),
    resendVerificationService: vi.fn(),
    logOutService: vi.fn(),
    logInService: vi.fn(),
}));

vi.mock("../../../../../common/middleware/genTokenAndSetCookie", () => ({
    generateTokenandSetCookie: vi.fn(),
}));

vi.mock("../../user/user.model", () => ({
    default: {
        findById: vi.fn(),
    },
}));

vi.mock("../auth.model", () => ({
    default: {
        findOne: vi.fn(),
    },
}));

import * as authService from "../auth.service";
import jwt from "jsonwebtoken";
import UserModel from "../../user/user.model";
import AuthModel from "../auth.model";
import { generateTokenandSetCookie } from "../../../../../common/middleware/genTokenAndSetCookie";
import { requireAuth } from "../../../../../common/middleware/requireAuth";
import { protectRoutes } from "../../../../../common/middleware/protectRoutes";
import {
    registerController,
    verifyEmailController,
    resendVerificationController,
    logOutController,
    logInController,
} from "../auth.controller";
import {
    UnauthorizedError,
    BadRequestError,
} from "../../../../../common/error/errorStatusCode";

const mockRes = () => {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.cookie = vi.fn().mockReturnValue(res);
    return res as Response;
};

const mockAuthReq = (cookie?: string) =>
    ({
        cookies: cookie === undefined ? {} : { jwt: cookie },
    }) as unknown as Request;

const next = vi.fn() as unknown as NextFunction;

beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
});

describe("auth.controller", () => {
    describe("registerController", () => {
        it("registers a user, sets a cookie, and responds 201", async () => {
            const req = {
                body: {
                    username: "johndoe",
                    givenname: "John",
                    surname: "Doe",
                    email: "john@gmail.com",
                    password: "Password1",
                },
            } as Request;
            const res = mockRes();

            const userResult = { userId: "user123", username: "johndoe" };
            (authService.registerService as any).mockResolvedValue(userResult);

            await registerController(req, res);

            expect(authService.registerService).toHaveBeenCalledWith(req.body);
            expect(generateTokenandSetCookie).toHaveBeenCalledWith(
                res,
                "user123"
            );
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                message: "User created successfully",
                data: userResult,
            });
        });
    });

describe("auth middleware", () => {
                describe("requireAuth", () => {
                    it("returns 401 when the JWT cookie is missing", async () => {
                        const res = mockRes();

                        await requireAuth(mockAuthReq(), res, next);

                        expect(res.status).toHaveBeenCalledWith(401);
                        expect(res.json).toHaveBeenCalledWith({
                            message: "Not authenticated",
                        });
                        expect(next).not.toHaveBeenCalled();
                    });

                    it("returns 401 when the token references a missing user", async () => {
                        const res = mockRes();
                        (jwt.verify as any).mockReturnValue({ userId: "missing" });
                        (UserModel.findById as any).mockResolvedValue(null);

                        await requireAuth(mockAuthReq("token"), res, next);

                        expect(res.status).toHaveBeenCalledWith(401);
                        expect(res.json).toHaveBeenCalledWith({
                            message: "User not found",
                        });
                    });

                    it("attaches the user and calls next for a valid token", async () => {
                        const res = mockRes();
                        const user = { _id: "user1" };
                        const req = mockAuthReq("token");
                        (jwt.verify as any).mockReturnValue({ userId: "user1" });
                        (UserModel.findById as any).mockResolvedValue(user);

                        await requireAuth(req, res, next);

                        expect((req as any).user).toBe(user);
                        expect(next).toHaveBeenCalledOnce();
                        expect(res.status).not.toHaveBeenCalled();
                    });

                    it("returns a generic 401 for unexpected verification failures", async () => {
                        const res = mockRes();
                        const errorSpy = vi
                            .spyOn(console, "error")
                            .mockImplementation(() => undefined);
                        (jwt.verify as any).mockImplementation(() => {
                            throw new Error("invalid token");
                        });

                        await requireAuth(mockAuthReq("token"), res, next);

                        expect(errorSpy).toHaveBeenCalled();
                        expect(res.status).toHaveBeenCalledWith(401);
                        expect(res.json).toHaveBeenCalledWith({
                            message: "Invalid or expired token",
                        });
                        errorSpy.mockRestore();
                    });
                });

                describe("protectRoutes", () => {
                    const user = { _id: "user1" };

                    const setupUserLookup = () => {
                        (jwt.verify as any).mockReturnValue({ userId: "user1" });
                        const select = vi.fn().mockResolvedValue(user);
                        (UserModel.findById as any).mockReturnValue({ select });
                    };

                    it("returns 401 when the JWT cookie is missing", async () => {
                        const res = mockRes();

                        await protectRoutes(mockAuthReq(), res, next);

                        expect(res.status).toHaveBeenCalledWith(401);
                        expect(res.json).toHaveBeenCalledWith({
                            message: "Not authenticated",
                        });
                    });

                    it("returns 401 when the token references a missing user", async () => {
                        const res = mockRes();
                        (jwt.verify as any).mockReturnValue({ userId: "missing" });
                        (UserModel.findById as any).mockReturnValue({
                            select: vi.fn().mockResolvedValue(null),
                        });

                        await protectRoutes(mockAuthReq("token"), res, next);

                        expect(res.status).toHaveBeenCalledWith(401);
                        expect(res.json).toHaveBeenCalledWith({
                            message: "User not found",
                        });
                    });

                    it("returns 401 when the user has no auth record", async () => {
                        const res = mockRes();
                        setupUserLookup();
                        (AuthModel.findOne as any).mockResolvedValue(null);

                        await protectRoutes(mockAuthReq("token"), res, next);

                        expect(res.status).toHaveBeenCalledWith(401);
                        expect(res.json).toHaveBeenCalledWith({
                            message: "Auth record not found for user",
                        });
                    });

                    it("returns 403 when the user is not verified", async () => {
                        const res = mockRes();
                        setupUserLookup();
                        (AuthModel.findOne as any).mockResolvedValue({
                            isVerified: false,
                        });

                        await protectRoutes(mockAuthReq("token"), res, next);

                        expect(res.status).toHaveBeenCalledWith(403);
                        expect(res.json).toHaveBeenCalledWith({
                            message: "User is not verified",
                        });
                    });

                    it("attaches the user and calls next for a verified user", async () => {
                        const res = mockRes();
                        const req = mockAuthReq("token");
                        setupUserLookup();
                        (AuthModel.findOne as any).mockResolvedValue({
                            isVerified: true,
                        });

                        await protectRoutes(req, res, next);

                        expect((req as any).user).toBe(user);
                        expect(next).toHaveBeenCalledOnce();
                        expect(res.status).not.toHaveBeenCalled();
                    });

                    it("returns a generic 401 for unexpected failures", async () => {
                        const res = mockRes();
                        const errorSpy = vi
                            .spyOn(console, "error")
                            .mockImplementation(() => undefined);
                        (jwt.verify as any).mockImplementation(() => {
                            throw new Error("invalid token");
                        });

                        await protectRoutes(mockAuthReq("token"), res, next);

                        expect(errorSpy).toHaveBeenCalled();
                        expect(res.status).toHaveBeenCalledWith(401);
                        expect(res.json).toHaveBeenCalledWith({
                            message: "Invalid or expired token",
                        });
                        errorSpy.mockRestore();
                    });
                });
            });

    describe("verifyEmailController", () => {
        it("verifies email and responds 200", async () => {
            const req = { query: { token: "abc123" } } as unknown as Request;
            const res = mockRes();

            await verifyEmailController(req, res);

            expect(authService.verifyEmailService).toHaveBeenCalledWith(
                "abc123"
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "User email verified successfully",
            });
        });

        it("throws BadRequestError when token missing", async () => {
            const req = { query: {} } as unknown as Request;
            const res = mockRes();

            await expect(verifyEmailController(req, res)).rejects.toThrow(
                BadRequestError
            );
            expect(authService.verifyEmailService).not.toHaveBeenCalled();
        });

        it("throws BadRequestError when token is not a string", async () => {
            const req = { query: { token: ["a", "b"] } } as unknown as Request;
            const res = mockRes();

            await expect(verifyEmailController(req, res)).rejects.toThrow(
                BadRequestError
            );
        });
    });

    describe("resendVerificationController", () => {
        it("resends verification email for authenticated user", async () => {
            const req = {
                user: { email: "john@gmail.com" },
            } as unknown as Request;
            const res = mockRes();

            await resendVerificationController(req, res);

            expect(authService.resendVerificationService).toHaveBeenCalledWith(
                "john@gmail.com"
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Verification send to email successfully",
            });
        });

        it("throws UnauthorizedError when no email on req.user", async () => {
            const req = { user: undefined } as unknown as Request;
            const res = mockRes();

            await expect(
                resendVerificationController(req, res)
            ).rejects.toThrow(UnauthorizedError);
        });
    });

    describe("logOutController", () => {
        it("logs out and clears the jwt cookie", async () => {
            const req = {
                user: { _id: { toString: () => "user123" } },
            } as unknown as Request;
            const res = mockRes();

            await logOutController(req, res);

            expect(authService.logOutService).toHaveBeenCalledWith("user123");
            expect(res.cookie).toHaveBeenCalledWith(
                "jwt",
                "",
                expect.objectContaining({ maxAge: 0 })
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "User logged out successfully",
            });
        });

        it("throws UnauthorizedError when no user on request", async () => {
            const req = { user: undefined } as unknown as Request;
            const res = mockRes();

            await expect(logOutController(req, res)).rejects.toThrow(
                UnauthorizedError
            );
        });
    });

    describe("logInController", () => {
        it("logs in a user, sets a cookie, and responds 200", async () => {
            const req = {
                body: { email: "john@gmail.com", password: "Password1" },
            } as Request;
            const res = mockRes();

            const userResult = { userId: "user123", username: "johndoe" };
            (authService.logInService as any).mockResolvedValue(userResult);

            await logInController(req, res);

            expect(authService.logInService).toHaveBeenCalledWith(req.body);
            expect(generateTokenandSetCookie).toHaveBeenCalledWith(
                res,
                "user123"
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "User logged in successfully",
                data: userResult,
            });
        });
    });
});

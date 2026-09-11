import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";

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

import * as authService from "../auth.service";
import { generateTokenandSetCookie } from "../../../../../common/middleware/genTokenAndSetCookie";
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

beforeEach(() => {
    vi.clearAllMocks();
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

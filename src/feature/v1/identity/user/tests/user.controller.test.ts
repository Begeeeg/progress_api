import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";

vi.mock("../user.service", () => ({
    getUserService: vi.fn(),
    updateUserInfoService: vi.fn(),
    updatePasswordService: vi.fn(),
    searchUsersService: vi.fn(),
    deleteUserService: vi.fn(),
}));

import * as userService from "../user.service";
import {
    getUserController,
    updateUserInfoController,
    updatePasswordController,
    searchUsersController,
    deleteUserController,
} from "../user.controller";

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

describe("user.controller", () => {
    describe("getUserController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined } as unknown as Request;
            const res = mockRes();

            await getUserController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                message: "Unauthorized",
            });
            expect(userService.getUserService).not.toHaveBeenCalled();
        });

        it("fetches the profile for the authenticated user and returns 200", async () => {
            const req = {
                user: { _id: { toString: () => "user123" } },
            } as unknown as Request;
            const res = mockRes();
            const profile = { id: "user123", username: "johndoe" };

            (userService.getUserService as any).mockResolvedValue(profile);

            await getUserController(req, res);

            expect(userService.getUserService).toHaveBeenCalledWith({
                id: "user123",
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "User fetched successfully",
                data: profile,
            });
        });
    });

    describe("updateUserInfoController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = {
                user: undefined,
                body: {},
            } as unknown as Request;
            const res = mockRes();

            await updateUserInfoController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(userService.updateUserInfoService).not.toHaveBeenCalled();
        });

        it("forwards the body fields and authenticated id to the service", async () => {
            const req = {
                user: { _id: { toString: () => "user123" } },
                body: {
                    username: "newname",
                    givenname: "Jane",
                    surname: "Doe",
                    password: "Password1",
                },
            } as unknown as Request;
            const res = mockRes();
            const updated = { id: "user123", username: "newname" };

            (userService.updateUserInfoService as any).mockResolvedValue(
                updated
            );

            await updateUserInfoController(req, res);

            expect(userService.updateUserInfoService).toHaveBeenCalledWith({
                id: "user123",
                username: "newname",
                givenname: "Jane",
                surname: "Doe",
                password: "Password1",
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "User info updated successfully",
                data: updated,
            });
        });
    });

    describe("updatePasswordController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined, body: {} } as unknown as Request;
            const res = mockRes();

            await updatePasswordController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(userService.updatePasswordService).not.toHaveBeenCalled();
        });

        it("forwards current/new password to the service and returns 200 with no data field", async () => {
            const req = {
                user: { _id: { toString: () => "user123" } },
                body: {
                    currentPassword: "OldPass1",
                    newPassword: "NewPass1",
                },
            } as unknown as Request;
            const res = mockRes();

            await updatePasswordController(req, res);

            expect(userService.updatePasswordService).toHaveBeenCalledWith({
                id: "user123",
                currentPassword: "OldPass1",
                newPassword: "NewPass1",
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Password updated successfully",
            });
        });
    });

    describe("searchUsersController", () => {
        it("returns 400 when no search field is provided", async () => {
            const req = { query: {} } as unknown as Request;
            const res = mockRes();

            await searchUsersController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Invalid search query",
            });
            expect(userService.searchUsersService).not.toHaveBeenCalled();
        });

        it("returns 400 when the query param is an array instead of a string", async () => {
            // e.g. ?username=a&username=b — Express parses this as string[]
            const req = {
                query: { username: ["a", "b"] },
            } as unknown as Request;
            const res = mockRes();

            await searchUsersController(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("uses username when provided", async () => {
            const req = {
                query: { username: "john" },
            } as unknown as Request;
            const res = mockRes();
            (userService.searchUsersService as any).mockResolvedValue([]);

            await searchUsersController(req, res);

            expect(userService.searchUsersService).toHaveBeenCalledWith({
                query: "john",
            });
        });

        it("falls back to givenname when username is absent", async () => {
            const req = {
                query: { givenname: "Jane" },
            } as unknown as Request;
            const res = mockRes();
            (userService.searchUsersService as any).mockResolvedValue([]);

            await searchUsersController(req, res);

            expect(userService.searchUsersService).toHaveBeenCalledWith({
                query: "Jane",
            });
        });

        it("falls back to surname when username and givenname are both absent", async () => {
            const req = {
                query: { surname: "Doe" },
            } as unknown as Request;
            const res = mockRes();
            (userService.searchUsersService as any).mockResolvedValue([]);

            await searchUsersController(req, res);

            expect(userService.searchUsersService).toHaveBeenCalledWith({
                query: "Doe",
            });
        });

        it("prioritizes username over givenname/surname when multiple are given", async () => {
            const req = {
                query: {
                    username: "john",
                    givenname: "Jane",
                    surname: "Doe",
                },
            } as unknown as Request;
            const res = mockRes();
            (userService.searchUsersService as any).mockResolvedValue([]);

            await searchUsersController(req, res);

            expect(userService.searchUsersService).toHaveBeenCalledWith({
                query: "john",
            });
        });

        it("returns 200 with the results on success", async () => {
            const req = {
                query: { username: "john" },
            } as unknown as Request;
            const res = mockRes();
            const results = [{ id: "u1", username: "johndoe" }];
            (userService.searchUsersService as any).mockResolvedValue(results);

            await searchUsersController(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Users retrieved successfully",
                data: results,
            });
        });
    });

    describe("deleteUserController", () => {
        it("returns 401 when req.user is missing", async () => {
            const req = { user: undefined, body: {} } as unknown as Request;
            const res = mockRes();

            await deleteUserController(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(userService.deleteUserService).not.toHaveBeenCalled();
        });

        it("deletes the account, clears the jwt cookie, and returns 200", async () => {
            const req = {
                user: { _id: { toString: () => "user123" } },
                body: { password: "Password1" },
            } as unknown as Request;
            const res = mockRes();

            await deleteUserController(req, res);

            expect(userService.deleteUserService).toHaveBeenCalledWith({
                id: "user123",
                password: "Password1",
            });
            expect(res.cookie).toHaveBeenCalledWith(
                "jwt",
                "",
                expect.objectContaining({ maxAge: 0 })
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Account deleted successfully",
            });
        });
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Request, Response } from "express";

vi.mock("../account.service", () => ({
    getAccountsService: vi.fn(),
    getAccountService: vi.fn(),
    deleteAccountService: vi.fn(),
}));

import * as accountService from "../account.service";
import {
    deleteAccountController,
    getAccountController,
    getAccountsController,
} from "../account.controller";
import { AccountProvider } from "../types/account.enum";

const mockRes = () => {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as Response;
};

const authedUser = { _id: { toString: () => "user-id" } };
const authedReq = (overrides: Record<string, unknown> = {}) =>
    ({
        user: authedUser,
        params: {},
        ...overrides,
    }) as unknown as Request;

beforeEach(() => {
    vi.clearAllMocks();
});

describe("account.controller", () => {
    it("lists accounts belonging to the authenticated user", async () => {
        const accounts = [{ id: "account-id" }];
        vi.mocked(accountService.getAccountsService).mockResolvedValue(
            accounts as never,
        );
        const res = mockRes();

        await getAccountsController(authedReq(), res);

        expect(accountService.getAccountsService).toHaveBeenCalledWith({
            userId: "user-id",
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Fetched accounts successfully",
            data: accounts,
        });
    });

    it("returns 401 for unauthenticated account listing", async () => {
        const res = mockRes();
        await getAccountsController(
            { user: undefined } as unknown as Request,
            res,
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(accountService.getAccountsService).not.toHaveBeenCalled();
    });

    it("fetches one account using its route provider and authenticated user ID", async () => {
        const account = { id: "account-id" };
        vi.mocked(accountService.getAccountService).mockResolvedValue(
            account as never,
        );
        const res = mockRes();

        await getAccountController(
            authedReq({ params: { provider: AccountProvider.GITHUB } }),
            res,
        );

        expect(accountService.getAccountService).toHaveBeenCalledWith({
            userId: "user-id",
            provider: AccountProvider.GITHUB,
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Fetched account successfully",
            data: account,
        });
    });

    it("returns 401 for unauthenticated provider lookup", async () => {
        const res = mockRes();
        await getAccountController(
            {
                user: undefined,
                params: { provider: AccountProvider.GITHUB },
            } as unknown as Request,
            res,
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(accountService.getAccountService).not.toHaveBeenCalled();
    });

    it("disconnects the authenticated user's account for the provider", async () => {
        const res = mockRes();

        await deleteAccountController(
            authedReq({ params: { provider: AccountProvider.GITHUB } }),
            res,
        );

        expect(accountService.deleteAccountService).toHaveBeenCalledWith({
            userId: "user-id",
            provider: AccountProvider.GITHUB,
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Account disconnected successfully",
        });
    });

    it("does not delete an account for an unauthenticated request", async () => {
        const res = mockRes();
        await deleteAccountController(
            {
                user: undefined,
                params: { provider: AccountProvider.GITHUB },
            } as unknown as Request,
            res,
        );

        expect(res.status).toHaveBeenCalledWith(401);
        expect(accountService.deleteAccountService).not.toHaveBeenCalled();
    });

    it("rejects providers that are not in AccountProvider", async () => {
        const getRes = mockRes();
        await getAccountController(
            authedReq({ params: { provider: "unknown" } }),
            getRes,
        );
        expect(getRes.status).toHaveBeenCalledWith(400);
        expect(getRes.json).toHaveBeenCalledWith({
            message: "Invalid account provider",
        });
        expect(accountService.getAccountService).not.toHaveBeenCalled();

        const deleteRes = mockRes();
        await deleteAccountController(
            authedReq({ params: { provider: "unknown" } }),
            deleteRes,
        );
        expect(deleteRes.status).toHaveBeenCalledWith(400);
        expect(deleteRes.json).toHaveBeenCalledWith({
            message: "Invalid account provider",
        });
        expect(accountService.deleteAccountService).not.toHaveBeenCalled();
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../account.model", () => ({
    default: {
        create: vi.fn(),
        find: vi.fn(),
        findOne: vi.fn(),
        findOneAndDelete: vi.fn(),
    },
}));

vi.mock("../../user/user.model", () => ({
    default: {
        findById: vi.fn(),
    },
}));

import AccountModel from "../account.model";
import UserModel from "../../user/user.model";
import {
    createAccountService,
    deleteAccountService,
    getAccountService,
    getAccountsService,
} from "../account.service";
import {
    ConflictError,
    NotFoundError,
} from "../../../../../common/error/errorStatusCode";
import { AccountProvider } from "../types/account.enum";

const userId = "507f191e810c19729de860ea";

const account = {
    _id: "account-id",
    provider: "github",
    providerAccountId: "github-user",
    username: "octocat",
    email: "octocat@example.com",
    avatarUrl: "https://example.com/avatar.png",
    profileUrl: "https://github.com/octocat",
    scopes: ["read:user"],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    accessToken: "must-not-be-returned",
    refreshToken: "must-not-be-returned",
    tokenExpiresAt: new Date("2027-01-01T00:00:00.000Z"),
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("account read and delete services", () => {
    describe("createAccountService", () => {
        const createData = {
            userId,
            provider: AccountProvider.GITHUB,
            providerAccountId: "github-user",
        };

        it("rejects creation when the Progress user does not exist", async () => {
            const select = vi.fn().mockResolvedValue(null);
            vi.mocked(UserModel.findById).mockReturnValue({ select } as never);

            await expect(
                createAccountService(createData),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(select).toHaveBeenCalledWith("_id");
            expect(AccountModel.findOne).not.toHaveBeenCalled();
        });

        it("rejects a second connected account for the same user and provider", async () => {
            const select = vi.fn().mockResolvedValue({ _id: userId });
            vi.mocked(UserModel.findById).mockReturnValue({ select } as never);
            vi.mocked(AccountModel.findOne).mockResolvedValueOnce(
                account as never,
            );

            await expect(
                createAccountService(createData),
            ).rejects.toBeInstanceOf(ConflictError);
            expect(AccountModel.findOne).toHaveBeenCalledWith({
                userId,
                provider: AccountProvider.GITHUB,
            });
            expect(AccountModel.create).not.toHaveBeenCalled();
        });

        it("rejects an external account already connected to another Progress user", async () => {
            const select = vi.fn().mockResolvedValue({ _id: userId });
            vi.mocked(UserModel.findById).mockReturnValue({ select } as never);
            vi.mocked(AccountModel.findOne)
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(account as never);

            await expect(
                createAccountService(createData),
            ).rejects.toBeInstanceOf(ConflictError);
            expect(AccountModel.findOne).toHaveBeenNthCalledWith(2, {
                provider: AccountProvider.GITHUB,
                providerAccountId: "github-user",
            });
            expect(AccountModel.create).not.toHaveBeenCalled();
        });

        it("creates an account and returns only public account fields", async () => {
            const select = vi.fn().mockResolvedValue({ _id: userId });
            vi.mocked(UserModel.findById).mockReturnValue({ select } as never);
            vi.mocked(AccountModel.findOne)
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(null);
            vi.mocked(AccountModel.create).mockResolvedValue(
                account as never,
            );

            const result = await createAccountService({
                ...createData,
                username: "octocat",
                email: "octocat@example.com",
                avatarUrl: "https://example.com/avatar.png",
                profileUrl: "https://github.com/octocat",
                accessToken: "access-token",
                refreshToken: "refresh-token",
                tokenExpiresAt: account.tokenExpiresAt,
                scopes: ["read:user"],
            });

            expect(AccountModel.create).toHaveBeenCalledWith({
                ...createData,
                username: "octocat",
                email: "octocat@example.com",
                avatarUrl: "https://example.com/avatar.png",
                profileUrl: "https://github.com/octocat",
                accessToken: "access-token",
                refreshToken: "refresh-token",
                tokenExpiresAt: account.tokenExpiresAt,
                scopes: ["read:user"],
            });
            expect(result).toEqual({
                id: "account-id",
                provider: "github",
                providerAccountId: "github-user",
                username: "octocat",
                email: "octocat@example.com",
                avatarUrl: "https://example.com/avatar.png",
                profileUrl: "https://github.com/octocat",
                scopes: ["read:user"],
                createdAt: account.createdAt,
                updatedAt: account.updatedAt,
            });
            expect(result).not.toHaveProperty("accessToken");
            expect(result).not.toHaveProperty("refreshToken");
        });

        it("uses null and empty-scope defaults for optional account fields", async () => {
            const select = vi.fn().mockResolvedValue({ _id: userId });
            vi.mocked(UserModel.findById).mockReturnValue({ select } as never);
            vi.mocked(AccountModel.findOne)
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(null);
            vi.mocked(AccountModel.create).mockResolvedValue(
                {
                    ...account,
                    username: null,
                    email: null,
                    avatarUrl: null,
                    profileUrl: null,
                    accessToken: null,
                    refreshToken: null,
                    tokenExpiresAt: null,
                    scopes: [],
                } as never,
            );

            await createAccountService(createData);

            expect(AccountModel.create).toHaveBeenCalledWith({
                ...createData,
                username: null,
                email: null,
                avatarUrl: null,
                profileUrl: null,
                accessToken: null,
                refreshToken: null,
                tokenExpiresAt: null,
                scopes: [],
            });
        });
    });

    it("returns only the authenticated user's safe account fields", async () => {
        const select = vi.fn().mockResolvedValue([account]);
        vi.mocked(AccountModel.find).mockReturnValue({ select } as never);

        const result = await getAccountsService({ userId });

        expect(AccountModel.find).toHaveBeenCalledWith({ userId });
        expect(select).toHaveBeenCalledWith(
            "provider providerAccountId username email avatarUrl profileUrl scopes createdAt updatedAt",
        );
        expect(result).toEqual([
            {
                id: "account-id",
                provider: "github",
                providerAccountId: "github-user",
                username: "octocat",
                email: "octocat@example.com",
                avatarUrl: "https://example.com/avatar.png",
                profileUrl: "https://github.com/octocat",
                scopes: ["read:user"],
                createdAt: account.createdAt,
                updatedAt: account.updatedAt,
            },
        ]);
        expect(result[0]).not.toHaveProperty("accessToken");
        expect(result[0]).not.toHaveProperty("refreshToken");
    });

    it("returns an account by provider scoped to the authenticated user", async () => {
        const select = vi.fn().mockResolvedValue(account);
        vi.mocked(AccountModel.findOne).mockReturnValue({ select } as never);

        const result = await getAccountService({
            userId,
            provider: AccountProvider.GITHUB,
        });

        expect(AccountModel.findOne).toHaveBeenCalledWith({
            userId,
            provider: AccountProvider.GITHUB,
        });
        expect(result.id).toBe("account-id");
        expect(result).not.toHaveProperty("accessToken");
    });

    it("returns not found when the user has no account for that provider", async () => {
        const select = vi.fn().mockResolvedValue(null);
        vi.mocked(AccountModel.findOne).mockReturnValue({ select } as never);

        await expect(
            getAccountService({ userId, provider: AccountProvider.GITHUB }),
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("deletes the authenticated user's account for the provider", async () => {
        vi.mocked(AccountModel.findOneAndDelete).mockResolvedValue(
            account as never,
        );

        await expect(
            deleteAccountService({ userId, provider: AccountProvider.GITHUB }),
        ).resolves.toBeUndefined();

        expect(AccountModel.findOneAndDelete).toHaveBeenCalledWith({
            userId,
            provider: AccountProvider.GITHUB,
        });
    });

    it("returns not found when deleting a provider without an account", async () => {
        vi.mocked(AccountModel.findOneAndDelete).mockResolvedValue(null);
        await expect(
            deleteAccountService({
                userId,
                provider: AccountProvider.GITHUB,
            }),
        ).rejects.toBeInstanceOf(NotFoundError);
    });
});

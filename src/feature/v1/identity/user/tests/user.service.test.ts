import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

vi.mock("../user.model", () => ({
    default: {
        findById: vi.fn(),
        findOne: vi.fn(),
        findByIdAndUpdate: vi.fn(),
        find: vi.fn(),
        deleteOne: vi.fn(),
    },
}));

vi.mock("../../auth/auth.model", () => ({
    default: {
        findOne: vi.fn(),
        find: vi.fn(),
        deleteOne: vi.fn(),
    },
}));

vi.mock("bcryptjs", () => ({
    default: {
        compare: vi.fn(),
        hash: vi.fn(),
    },
}));

import UserModel from "../user.model";
import AuthModel from "../../auth/auth.model";
import {
    getUserService,
    updateUserInfoService,
    updatePasswordService,
    searchUsersService,
    deleteUserService,
} from "../user.service";
import {
    BadRequestError,
    ConflictError,
    NotFoundError,
} from "../../../../../common/error/errorStatusCode";

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

describe("user.service", () => {
    describe("getUserService", () => {
        it("returns the combined user + auth profile", async () => {
            const user = {
                _id: "user123",
                username: "johndoe",
                givenname: "John",
                surname: "Doe",
                email: "john@gmail.com",
            };
            const auth = { isOnline: true, isVerified: true };

            (UserModel.findById as any).mockResolvedValue(user);
            (AuthModel.findOne as any).mockResolvedValue(auth);

            const result = await getUserService({ id: "user123" });

            expect(UserModel.findById).toHaveBeenCalledWith("user123");
            expect(result).toEqual({
                id: user._id,
                username: user.username,
                givenname: user.givenname,
                surname: user.surname,
                email: user.email,
                isOnline: true,
                isVerified: true,
            });
        });

        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(getUserService({ id: "missing" })).rejects.toThrow(
                NotFoundError
            );
        });

        it("throws NotFoundError when the auth record is missing", async () => {
            (UserModel.findById as any).mockResolvedValue({ _id: "user123" });
            (AuthModel.findOne as any).mockResolvedValue(null);

            await expect(getUserService({ id: "user123" })).rejects.toThrow(
                NotFoundError
            );
        });
    });

    describe("updateUserInfoService", () => {
        const baseUser = {
            _id: "user123",
            username: "johndoe",
            givenname: "John",
            surname: "Doe",
        };

        it("updates only the provided fields, falling back to current values", async () => {
            (UserModel.findById as any).mockResolvedValue(baseUser);
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue({ password: "hashed" }),
            });
            (bcrypt.compare as any).mockResolvedValue(true);
            (UserModel.findOne as any).mockResolvedValue(null); // no username clash
            (UserModel.findByIdAndUpdate as any).mockResolvedValue({
                _id: "user123",
                username: "johndoe",
                givenname: "Jane", // only this changed
                surname: "Doe",
            });

            const result = await updateUserInfoService({
                id: "user123",
                givenname: "Jane",
                password: "Password1",
            });

            expect(UserModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "user123",
                {
                    username: "johndoe", // fell back to current
                    givenname: "Jane",
                    surname: "Doe", // fell back to current
                },
                { new: true }
            );
            expect(result.givenname).toBe("Jane");
        });

        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(
                updateUserInfoService({ id: "missing", password: "x" })
            ).rejects.toThrow(NotFoundError);
        });

        it("throws NotFoundError when the auth record is missing", async () => {
            (UserModel.findById as any).mockResolvedValue(baseUser);
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue(null),
            });

            await expect(
                updateUserInfoService({ id: "user123", password: "x" })
            ).rejects.toThrow(NotFoundError);
        });

        it("throws BadRequestError when the password is invalid", async () => {
            (UserModel.findById as any).mockResolvedValue(baseUser);
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue({ password: "hashed" }),
            });
            (bcrypt.compare as any).mockResolvedValue(false);

            await expect(
                updateUserInfoService({
                    id: "user123",
                    givenname: "Jane",
                    password: "WrongPass1",
                })
            ).rejects.toThrow(BadRequestError);
        });

        it("throws BadRequestError when nothing actually changes (no-op update)", async () => {
            (UserModel.findById as any).mockResolvedValue(baseUser);
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue({ password: "hashed" }),
            });
            (bcrypt.compare as any).mockResolvedValue(true);

            await expect(
                updateUserInfoService({
                    id: "user123",
                    username: "johndoe", // same as current
                    password: "Password1",
                })
            ).rejects.toThrow(BadRequestError);
            // Must never hit the DB for a uniqueness check on a no-op
            expect(UserModel.findOne).not.toHaveBeenCalled();
        });

        it("throws ConflictError when the new username is already taken", async () => {
            (UserModel.findById as any).mockResolvedValue(baseUser);
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue({ password: "hashed" }),
            });
            (bcrypt.compare as any).mockResolvedValue(true);
            (UserModel.findOne as any).mockResolvedValue({
                _id: "someoneelse",
            });

            await expect(
                updateUserInfoService({
                    id: "user123",
                    username: "takenname",
                    password: "Password1",
                })
            ).rejects.toThrow(ConflictError);
        });

        it("allows a username change when the new username is free", async () => {
            (UserModel.findById as any).mockResolvedValue(baseUser);
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue({ password: "hashed" }),
            });
            (bcrypt.compare as any).mockResolvedValue(true);
            (UserModel.findOne as any).mockResolvedValue(null); // free
            (UserModel.findByIdAndUpdate as any).mockResolvedValue({
                _id: "user123",
                username: "freshname",
                givenname: "John",
                surname: "Doe",
            });

            const result = await updateUserInfoService({
                id: "user123",
                username: "freshname",
                password: "Password1",
            });

            expect(UserModel.findOne).toHaveBeenCalledWith({
                username: "freshname",
            });
            expect(result.username).toBe("freshname");
        });

        it("does not run a uniqueness check when username is left unchanged/omitted", async () => {
            (UserModel.findById as any).mockResolvedValue(baseUser);
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue({ password: "hashed" }),
            });
            (bcrypt.compare as any).mockResolvedValue(true);
            (UserModel.findByIdAndUpdate as any).mockResolvedValue({
                _id: "user123",
                username: "johndoe",
                givenname: "John",
                surname: "Smith",
            });

            await updateUserInfoService({
                id: "user123",
                surname: "Smith",
                password: "Password1",
            });

            expect(UserModel.findOne).not.toHaveBeenCalled();
        });
    });

    describe("updatePasswordService", () => {
        const baseUser = { _id: "user123" };

        it("hashes and saves the new password on success", async () => {
            const authDoc = {
                password: "old-hashed",
                save: vi.fn().mockResolvedValue(true),
            };
            (UserModel.findById as any).mockResolvedValue(baseUser);
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue(authDoc),
            });
            (bcrypt.compare as any)
                .mockResolvedValueOnce(true) // current password check
                .mockResolvedValueOnce(false); // not same as old
            (bcrypt.hash as any).mockResolvedValue("new-hashed");

            await updatePasswordService({
                id: "user123",
                currentPassword: "OldPass1",
                newPassword: "NewPass1",
            });

            expect(authDoc.password).toBe("new-hashed");
            expect(authDoc.save).toHaveBeenCalled();
        });

        it("throws NotFoundError when the user does not exist", async () => {
            (UserModel.findById as any).mockResolvedValue(null);

            await expect(
                updatePasswordService({
                    id: "missing",
                    currentPassword: "x",
                    newPassword: "y",
                })
            ).rejects.toThrow(NotFoundError);
        });

        it("throws NotFoundError when the auth record is missing", async () => {
            (UserModel.findById as any).mockResolvedValue(baseUser);
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue(null),
            });

            await expect(
                updatePasswordService({
                    id: "user123",
                    currentPassword: "x",
                    newPassword: "y",
                })
            ).rejects.toThrow(NotFoundError);
        });

        it("throws BadRequestError when the current password is wrong", async () => {
            (UserModel.findById as any).mockResolvedValue(baseUser);
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue({ password: "old-hashed" }),
            });
            (bcrypt.compare as any).mockResolvedValue(false);

            await expect(
                updatePasswordService({
                    id: "user123",
                    currentPassword: "WrongOld1",
                    newPassword: "NewPass1",
                })
            ).rejects.toThrow(BadRequestError);
        });

        it("throws BadRequestError when the new password matches the old one", async () => {
            (UserModel.findById as any).mockResolvedValue(baseUser);
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockResolvedValue({ password: "old-hashed" }),
            });
            (bcrypt.compare as any)
                .mockResolvedValueOnce(true) // current password valid
                .mockResolvedValueOnce(true); // same as old

            await expect(
                updatePasswordService({
                    id: "user123",
                    currentPassword: "SamePass1",
                    newPassword: "SamePass1",
                })
            ).rejects.toThrow(BadRequestError);
        });
    });

    describe("searchUsersService", () => {
        it("searches username, givenname, and surname with a single $or query", async () => {
            (UserModel.find as any).mockReturnValue({
                select: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([]),
                }),
            });

            await searchUsersService({ query: "john" });

            expect(UserModel.find).toHaveBeenCalledWith({
                $or: [
                    { username: { $regex: "john", $options: "i" } },
                    { givenname: { $regex: "john", $options: "i" } },
                    { surname: { $regex: "john", $options: "i" } },
                ],
            });
        });

        it("returns an empty array early when no users match (skips the auth lookup)", async () => {
            (UserModel.find as any).mockReturnValue({
                select: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([]),
                }),
            });

            const result = await searchUsersService({ query: "nomatch" });

            expect(result).toEqual([]);
            expect(AuthModel.find).not.toHaveBeenCalled();
        });

        it("maps isOnline per-user from a batched auth lookup", async () => {
            const users = [
                {
                    _id: { toString: () => "u1" },
                    username: "alice",
                    givenname: "Alice",
                    surname: "Smith",
                    email: "alice@gmail.com",
                },
                {
                    _id: { toString: () => "u2" },
                    username: "bob",
                    givenname: "Bob",
                    surname: "Jones",
                    email: "bob@gmail.com",
                },
            ];
            (UserModel.find as any).mockReturnValue({
                select: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue(users),
                }),
            });
            (AuthModel.find as any).mockReturnValue({
                select: vi.fn().mockResolvedValue([
                    { userId: { toString: () => "u1" }, isOnline: true },
                    { userId: { toString: () => "u2" }, isOnline: false },
                ]),
            });

            const result = await searchUsersService({ query: "a" });

            expect(result).toEqual([
                expect.objectContaining({ username: "alice", isOnline: true }),
                expect.objectContaining({ username: "bob", isOnline: false }),
            ]);
        });

        it("defaults isOnline to false when a matched user has no auth record", async () => {
            const users = [
                {
                    _id: { toString: () => "orphan" },
                    username: "orphaned",
                    givenname: "Orphan",
                    surname: "User",
                    email: "orphan@gmail.com",
                },
            ];
            (UserModel.find as any).mockReturnValue({
                select: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue(users),
                }),
            });
            (AuthModel.find as any).mockReturnValue({
                select: vi.fn().mockResolvedValue([]), // no matching auth docs
            });

            const result = await searchUsersService({ query: "orphan" });

            expect(result[0].isOnline).toBe(false);
        });

        it("throws BadRequestError for an empty query", async () => {
            await expect(searchUsersService({ query: "" })).rejects.toThrow(
                BadRequestError
            );
        });

        it("throws BadRequestError for a whitespace-only query", async () => {
            await expect(searchUsersService({ query: "   " })).rejects.toThrow(
                BadRequestError
            );
        });
    });

    describe("deleteUserService", () => {
        it("deletes the user and auth record within a transaction on success", async () => {
            const user = { _id: "user123", username: "johndoe" };
            (UserModel.findById as any).mockReturnValue({
                session: vi.fn().mockResolvedValue(user),
            });
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockReturnValue({
                    session: vi.fn().mockResolvedValue({ password: "hashed" }),
                }),
            });
            (bcrypt.compare as any).mockResolvedValue(true);
            (AuthModel.deleteOne as any).mockReturnValue({
                session: vi.fn().mockResolvedValue({}),
            });
            (UserModel.deleteOne as any).mockReturnValue({
                session: vi.fn().mockResolvedValue({}),
            });

            const result = await deleteUserService({
                id: "user123",
                password: "Password1",
            });

            expect(mockSession.commitTransaction).toHaveBeenCalled();
            expect(result).toEqual({ id: "user123", username: "johndoe" });
        });

        it("aborts the transaction and rethrows when the user is not found", async () => {
            (UserModel.findById as any).mockReturnValue({
                session: vi.fn().mockResolvedValue(null),
            });

            await expect(
                deleteUserService({ id: "missing", password: "x" })
            ).rejects.toThrow(NotFoundError);
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
        });

        it("aborts the transaction and rethrows when the auth record is missing", async () => {
            (UserModel.findById as any).mockReturnValue({
                session: vi
                    .fn()
                    .mockResolvedValue({ _id: "user123", username: "johndoe" }),
            });
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockReturnValue({
                    session: vi.fn().mockResolvedValue(null),
                }),
            });

            await expect(
                deleteUserService({ id: "user123", password: "Password1" })
            ).rejects.toThrow(NotFoundError);
            expect(mockSession.abortTransaction).toHaveBeenCalled();
            expect(mockSession.endSession).toHaveBeenCalled();
            expect(AuthModel.deleteOne).not.toHaveBeenCalled();
        });

        it("aborts the transaction and rethrows when the password is invalid", async () => {
            (UserModel.findById as any).mockReturnValue({
                session: vi.fn().mockResolvedValue({ _id: "user123" }),
            });
            (AuthModel.findOne as any).mockReturnValue({
                select: vi.fn().mockReturnValue({
                    session: vi.fn().mockResolvedValue({ password: "hashed" }),
                }),
            });
            (bcrypt.compare as any).mockResolvedValue(false);

            await expect(
                deleteUserService({ id: "user123", password: "WrongPass1" })
            ).rejects.toThrow(BadRequestError);
            expect(mockSession.abortTransaction).toHaveBeenCalled();
        });
    });
});

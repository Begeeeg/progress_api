import mongoose from "mongoose";
import {
    BadRequestError,
    ConflictError,
    NotFoundError,
} from "../../../../common/error/errorStatusCode";
import AuthModel from "../auth/auth.model";
import {
    DeleteUserData,
    GetUserData,
    SearchUsersData,
    UpdateUserInfoData,
    UpdateUserPasswordData,
} from "./types/user.types";
import UserModel from "./user.model";
import bcrypt from "bcryptjs";

/**
 * Retrieves a user's public account information together with authentication
 * state stored in the corresponding AuthModel document.
 *
 * User profile data and authentication data are intentionally kept in
 * separate models, so both records must exist for a complete account.
 */
export const getUserService = async ({ id }: GetUserData) => {
    const user = await UserModel.findById(id);
    if (!user) {
        throw new NotFoundError("User not found");
    }

    // Authentication state is stored separately from the user profile,
    // so the auth record is required to return online/verification status.
    const auth = await AuthModel.findOne({ userId: user._id });
    if (!auth) {
        throw new NotFoundError("Auth record not found for user");
    }

    return {
        id: user._id,
        username: user.username,
        givenname: user.givenname,
        surname: user.surname,
        email: user.email,
        isOnline: auth.isOnline,
        isVerified: auth.isVerified,
    };
};

/**
 * Updates a user's profile information after verifying their current password.
 *
 * The password requirement adds an additional authentication step before
 * allowing changes to account-identifying information such as the username.
 */
export const updateUserInfoService = async ({
    id,
    username,
    givenname,
    surname,
    password,
}: UpdateUserInfoData) => {
    const user = await UserModel.findById(id);
    if (!user) {
        throw new NotFoundError("User not found");
    }

    // Password is normally excluded from AuthModel queries, so it must be
    // explicitly selected here because it is required for re-authentication.
    const auth = await AuthModel.findOne({ userId: user._id }).select(
        "+password"
    );
    if (!auth) {
        throw new NotFoundError("Auth record not found");
    }

    // Require the current password before allowing profile changes to reduce
    // the risk of unauthorized modifications from an already-authenticated session.
    const isPasswordValid = await bcrypt.compare(password, auth.password);
    if (!isPasswordValid) {
        throw new BadRequestError("Invalid password");
    }

    // Preserve existing values for fields that were not included in the update.
    // This allows the service to support partial profile updates.
    const nextUsername = username ?? user.username;
    const nextGivenname = givenname ?? user.givenname;
    const nextSurname = surname ?? user.surname;

    // Reject requests that would write the exact same profile data back to
    // the database because they do not produce any meaningful state change.
    const isNoOpUpdate =
        nextUsername === user.username &&
        nextGivenname === user.givenname &&
        nextSurname === user.surname;

    if (isNoOpUpdate) {
        throw new BadRequestError(
            "At least one field must be different from your current info"
        );
    }

    if (nextUsername !== user.username) {
        // Username changes must be checked against existing accounts before
        // updating because usernames are expected to remain unique.
        const existingUser = await UserModel.findOne({
            username: nextUsername,
        });
        if (existingUser) {
            throw new ConflictError("Username already in use");
        }
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
        id,
        {
            username: nextUsername,
            givenname: nextGivenname,
            surname: nextSurname,
        },
        { new: true }
    );

    return {
        id: updatedUser!._id,
        username: updatedUser!.username,
        givenname: updatedUser!.givenname,
        surname: updatedUser!.surname,
    };
};

/**
 * Changes the authenticated user's password after validating the current
 * password and ensuring the new password is not identical to the old one.
 */
export const updatePasswordService = async ({
    id,
    currentPassword,
    newPassword,
}: UpdateUserPasswordData) => {
    const user = await UserModel.findById(id);
    if (!user) {
        throw new NotFoundError("User not found");
    }

    // Password is normally excluded from AuthModel queries, so explicitly
    // select it only for the credential comparison required by this operation.
    const auth = await AuthModel.findOne({ userId: user._id }).select(
        "+password"
    );
    if (!auth) {
        throw new NotFoundError("Auth record not found");
    }

    // Verify the existing password before permitting a credential change.
    const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        auth.password
    );
    if (!isCurrentPasswordValid) {
        throw new BadRequestError("Current password is incorrect");
    }

    // Prevent users from replacing the password with the same credential,
    // which would provide no actual security change.
    const isSameAsOld = await bcrypt.compare(newPassword, auth.password);
    if (isSameAsOld) {
        throw new BadRequestError(
            "New password must be different from your current password"
        );
    }

    // Store only the bcrypt hash; the plaintext new password is never persisted.
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    auth.password = hashedPassword;
    await auth.save();
};

/**
 * Searches users by username, given name, or surname and returns a limited
 * set of profile information together with their current online status.
 *
 * The result is intentionally capped to prevent an unrestricted search from
 * returning an unnecessarily large number of user records.
 */
export const searchUsersService = async ({ query }: SearchUsersData) => {
    // Reject empty or whitespace-only queries before performing a database search.
    if (!query || query.trim().length === 0) {
        throw new BadRequestError("Search query is required");
    }

    // Remove surrounding whitespace so the actual search term is consistent.
    const trimmedQuery = query.trim();

    const users = await UserModel.find({
        $or: [
            { username: { $regex: trimmedQuery, $options: "i" } },
            { givenname: { $regex: trimmedQuery, $options: "i" } },
            { surname: { $regex: trimmedQuery, $options: "i" } },
        ],
    })
        // Only retrieve fields needed by the search response.
        .select("username givenname surname email")
        // Limit the result set to prevent large responses and unnecessary queries.
        .limit(20);

    if (users.length === 0) {
        return [];
    }

    // Collect the matching user IDs so authentication state can be retrieved
    // in a single query instead of querying AuthModel once per user.
    const userIds = users.map((user) => user._id);

    const auths = await AuthModel.find({
        userId: { $in: userIds },
    }).select("userId isOnline");

    // Index authentication records by user ID so online status can be
    // associated with each user without repeatedly searching the auth array.
    const authByUserId = new Map(
        auths.map((auth) => [auth.userId.toString(), auth.isOnline])
    );

    return users.map((user) => ({
        id: user._id,
        username: user.username,
        givenname: user.givenname,
        surname: user.surname,
        email: user.email,
        // Treat a missing auth record as offline for the search response.
        isOnline: authByUserId.get(user._id.toString()) ?? false,
    }));
};

/**
 * Permanently deletes a user account after validating the user's password.
 *
 * UserModel and AuthModel are deleted within the same transaction so the
 * account does not intentionally leave one of its two related records behind.
 */
export const deleteUserService = async ({ id, password }: DeleteUserData) => {
    const session = await mongoose.startSession();

    try {
        // Deleting the user and authentication records together ensures that
        // either both records are removed or neither change is committed.
        session.startTransaction();

        const user = await UserModel.findById(id).session(session);
        if (!user) {
            throw new NotFoundError("User not found");
        }

        // Explicitly include the hidden password field because account deletion
        // requires re-authentication using the user's current password.
        const auth = await AuthModel.findOne({ userId: user._id })
            .select("+password")
            .session(session);
        if (!auth) {
            throw new NotFoundError("Auth record not found");
        }

        // Require the current password before performing an irreversible
        // account deletion operation.
        const isPasswordValid = await bcrypt.compare(password, auth.password);
        if (!isPasswordValid) {
            throw new BadRequestError("Invalid password");
        }

        // Remove the authentication record and user profile within the same
        // transaction so the two related account records remain consistent.
        await AuthModel.deleteOne({ userId: user._id }).session(session);
        await UserModel.deleteOne({ _id: user._id }).session(session);

        // Make the deletion permanent only after every required database
        // operation has completed successfully.
        await session.commitTransaction();

        return {
            id: user._id,
            username: user.username,
        };
    } catch (error) {
        // Any failure rolls back the transaction so a partial account deletion
        // is not committed.
        await session.abortTransaction();
        throw error;
    } finally {
        // Release the session regardless of whether the transaction succeeded
        // or failed to avoid retaining database session resources.
        session.endSession();
    }
};

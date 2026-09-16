import AuthModel from "../../feature/v1/identity/auth/auth.model";
import UserModel from "../../feature/v1/identity/user/user.model";

/**
 * Removes users who were never verified before their verification window expired.
 *
 * The cleanup removes both the user record and its corresponding authentication
 * record because the two models represent related parts of the same account.
 */
export const cleanupUnverifiedUsers = async () => {
    const expiredUsers = await AuthModel.find({
        isVerified: false,
        unverifiedExpiresAt: { $lte: new Date() },
    });

    const userIds = expiredUsers.map((u) => u.userId);

    if (userIds.length === 0) return;

    // Delete both records to prevent orphaned authentication data after
    // an unverified account is removed.
    await UserModel.deleteMany({ _id: { $in: userIds } });
    await AuthModel.deleteMany({ userId: { $in: userIds } });
};

import AuthModel from "../../feature/v1/identity/auth/auth.model";
import UserModel from "../../feature/v1/identity/user/user.model";

export const cleanupUnverifiedUsers = async () => {
    const expiredUsers = await AuthModel.find({
        isVerified: false,
        unverifiedExpiresAt: { $lte: new Date() },
    });

    const userIds = expiredUsers.map((u) => u.userId);

    if (userIds.length === 0) return;

    await UserModel.deleteMany({ _id: { $in: userIds } });
    await AuthModel.deleteMany({ userId: { $in: userIds } });
};

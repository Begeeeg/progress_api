import { NotFoundError } from "../../../../common/error/errorStatusCode";
import AuthModel from "../auth/auth.model";
import { GetUserData } from "./types/user.types";
import UserModel from "./user.model";

export const getUserService = async ({ id }: GetUserData) => {
    const user = await UserModel.findById(id);
    if (!user) {
        throw new NotFoundError("User not found");
    }

    const auth = await AuthModel.findOne({ userId: user._id });
    if (!auth) {
        throw new NotFoundError("Auth record not found for user");
    }

    return {
        id: user._id,
        username: user.username,
        email: user.email,
        isOnline: auth.isOnline,
        isVerified: auth.isVerified,
    };
};

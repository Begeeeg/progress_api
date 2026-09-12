import {
    BadRequestError,
    ConflictError,
    NotFoundError,
} from "../../../../common/error/errorStatusCode";
import AuthModel from "../auth/auth.model";
import {
    GetUserData,
    UpdateUserInfoData,
    UpdateUserPasswordData,
} from "./types/user.types";
import UserModel from "./user.model";
import bcrypt from "bcryptjs";

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
        givenname: user.givenname,
        surname: user.surname,
        email: user.email,
        isOnline: auth.isOnline,
        isVerified: auth.isVerified,
    };
};

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

    const auth = await AuthModel.findOne({ userId: user._id }).select(
        "+password"
    );
    if (!auth) {
        throw new NotFoundError("Auth record not found");
    }

    const isPasswordValid = await bcrypt.compare(password, auth.password);
    if (!isPasswordValid) {
        throw new BadRequestError("Invalid password");
    }

    const nextUsername = username ?? user.username;
    const nextGivenname = givenname ?? user.givenname;
    const nextSurname = surname ?? user.surname;

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

export const updatePasswordService = async ({
    id,
    currentPassword,
    newPassword,
}: UpdateUserPasswordData) => {
    const user = await UserModel.findById(id);
    if (!user) {
        throw new NotFoundError("User not found");
    }

    const auth = await AuthModel.findOne({ userId: user._id }).select(
        "+password"
    );
    if (!auth) {
        throw new NotFoundError("Auth record not found");
    }

    const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        auth.password
    );
    if (!isCurrentPasswordValid) {
        throw new BadRequestError("Current password is incorrect");
    }

    const isSameAsOld = await bcrypt.compare(newPassword, auth.password);
    if (isSameAsOld) {
        throw new BadRequestError(
            "New password must be different from your current password"
        );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    auth.password = hashedPassword;
    await auth.save();
};

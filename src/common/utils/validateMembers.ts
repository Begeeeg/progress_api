import mongoose from "mongoose";
import UserModel from "../../feature/v1/identity/user/user.model";
import { ProjectType } from "../../feature/v1/progress/project/types/project.enum";
import { BadRequestError, NotFoundError } from "../error/errorStatusCode";

export const validateMembers = async (
    userId: string,
    type: ProjectType,
    members?: string[]
): Promise<mongoose.Types.ObjectId[]> => {
    if (type === ProjectType.PERSONAL && members?.length) {
        throw new BadRequestError("Personal projects cannot have members");
    }

    if (type === ProjectType.TEAM && (!members || members.length === 0)) {
        throw new BadRequestError("Team projects require at least one member");
    }

    if (!members?.length) {
        return [];
    }

    // Remove duplicate usernames.
    const uniqueMembers = [...new Set(members)];

    if (uniqueMembers.length !== members.length) {
        throw new BadRequestError("Project members cannot contain duplicates");
    }

    // The owner cannot be a member.
    const owner = await UserModel.findById(userId).select("_id username");

    if (!owner) {
        throw new NotFoundError("User not found");
    }

    if (uniqueMembers.includes(owner.username)) {
        throw new BadRequestError("Project owner cannot be added as a member");
    }

    // Find users by username.
    const users = await UserModel.find({
        username: { $in: uniqueMembers },
    }).select("_id username");

    if (users.length !== uniqueMembers.length) {
        const foundUsernames = new Set(users.map((user) => user.username));

        const missingUsernames = uniqueMembers.filter(
            (username) => !foundUsernames.has(username)
        );

        throw new NotFoundError(
            `User(s) not found: ${missingUsernames.join(", ")}`
        );
    }

    // Convert usernames → ObjectIds.
    return users.map((user) => user._id);
};

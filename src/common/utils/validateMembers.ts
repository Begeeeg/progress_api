import mongoose from "mongoose";
import UserModel from "../../feature/v1/identity/user/user.model";
import { ProjectType } from "../../feature/v1/progress/project/types/project.enum";
import { BadRequestError, NotFoundError } from "../error/errorStatusCode";

/**
 * Validates project members according to the project's type and resolves
 * valid usernames into MongoDB ObjectIds for persistence.
 *
 * Ensures team projects have members, personal projects do not, and that
 * members are unique, exist in the database, and do not include the owner.
 */
export const validateMembers = async (
    userId: string,
    type: ProjectType,
    members?: string[]
): Promise<mongoose.Types.ObjectId[]> => {
    // Personal projects are intentionally limited to their owner,
    // so accepting members would violate the project's type constraint.
    if (type === ProjectType.PERSONAL && members?.length) {
        throw new BadRequestError("Personal projects cannot have members");
    }

    // A team project represents shared work, so at least one member
    // must be provided when creating or assigning a team project.
    if (type === ProjectType.TEAM && (!members || members.length === 0)) {
        throw new BadRequestError("Team projects require at least one member");
    }

    if (!members?.length) {
        return [];
    }

    // Prevent the same user from being assigned more than once, which
    // would create redundant membership entries in the project document.
    const uniqueMembers = [...new Set(members)];

    if (uniqueMembers.length !== members.length) {
        throw new BadRequestError("Project members cannot contain duplicates");
    }

    // The owner is retrieved separately because ownership is determined
    // by userId, while incoming members are identified by username.
    const owner = await UserModel.findById(userId).select("_id username");

    if (!owner) {
        throw new NotFoundError("User not found");
    }

    // Ownership and membership are mutually exclusive in this model;
    // the project owner is already implicitly associated with the project.
    if (uniqueMembers.includes(owner.username)) {
        throw new BadRequestError("Project owner cannot be added as a member");
    }

    // Resolve usernames against existing users before converting them to
    // ObjectIds, ensuring invalid member references are rejected.
    const users = await UserModel.find({
        username: { $in: uniqueMembers },
    }).select("_id username");

    if (users.length !== uniqueMembers.length) {
        // Compare the requested usernames with the database results so the
        // client receives the specific members that could not be resolved.
        const foundUsernames = new Set(users.map((user) => user.username));

        const missingUsernames = uniqueMembers.filter(
            (username) => !foundUsernames.has(username)
        );

        throw new NotFoundError(
            `User(s) not found: ${missingUsernames.join(", ")}`
        );
    }

    // Store stable database identifiers rather than usernames so project
    // membership remains tied to the referenced user records.
    return users.map((user) => user._id);
};

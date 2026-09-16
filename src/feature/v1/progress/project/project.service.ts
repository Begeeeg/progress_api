import {
    BadRequestError,
    ForbiddenError,
    NotFoundError,
} from "../../../../common/error/errorStatusCode";
import { validateMembers } from "../../../../common/utils/validateMembers";
import UserModel from "../../identity/user/user.model";
import ProjectModel from "./project.model";
import { ProjectType } from "./types/project.enum";
import {
    CreateProjectData,
    DeleteProjectData,
    GetProjectByIdData,
    GetProjectSearchData,
    GetProjectsData,
    UpdateProjectData,
} from "./types/project.types";

/**
 * Creates a project for the authenticated user.
 *
 * The project type determines whether members are allowed, while the
 * due date is validated and converted into a Date before persistence.
 */
export const createProjectService = async ({
    userId,
    title,
    type,
    documentation,
    githubRepo,
    dueDate,
    status,
    members,
}: CreateProjectData) => {
    const user = await UserModel.findById(userId);
    if (!user) {
        throw new NotFoundError("User not found");
    }

    // Personal projects are the default when no project type is supplied.
    const resolvedType = type ?? ProjectType.PERSONAL;

    // Validate membership rules before creating the project so invalid
    // member assignments cannot be persisted.
    const validatedMembers = await validateMembers(
        userId,
        resolvedType,
        members
    );

    const parsedDueDate = new Date(dueDate);

    // JavaScript Date accepts some invalid input without throwing, so
    // explicitly check the parsed timestamp before using it.
    if (isNaN(parsedDueDate.getTime())) {
        throw new BadRequestError("Invalid due date");
    }

    // Calculate the remaining days from the current time rather than
    // storing a derived value that could become stale after creation.
    const remainingDays = Math.ceil(
        (parsedDueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    // Projects cannot be created with a due date that has already passed.
    if (remainingDays < 0) {
        throw new BadRequestError("Due date cannot be in the past");
    }

    const project = await ProjectModel.create({
        userId,
        title,
        type: resolvedType,
        documentation,
        githubRepo,
        dueDate: parsedDueDate,
        status,
        members: validatedMembers,
    });

    // Ownership is determined from the persisted project owner reference,
    // allowing the response to explicitly indicate the caller's relationship
    // to the newly created project.
    const isOwner = project.userId.equals(user._id);

    return {
        title: project.title,
        type: project.type,
        document: project.documentation,
        githubRepo: project.githubRepo,
        status: project.status,
        dueDate: project.dueDate,
        members: project.members,
        remainingDays,
        isOwner,
    };
};

/**
 * Retrieves all projects that the authenticated user owns or is assigned to.
 *
 * Project ownership and membership are both considered when determining
 * which projects are visible to the user.
 */
export const getProjectsService = async ({ userId }: GetProjectsData) => {
    const user = await UserModel.findById(userId);

    if (!user) {
        throw new NotFoundError("User not found");
    }

    const project = await ProjectModel.find({
        // A user can access projects either through ownership or membership.
        $or: [{ userId: user._id }, { members: user._id }],
    })
        // Populate only the owner's identity fields needed by the response.
        .populate("userId", "_id username")
        .sort({ createdAt: -1 });

    return project.map((project) => {
        // Remaining days is calculated at read time so the value reflects
        // the current date instead of becoming stale.
        const remainingDays = Math.ceil(
            (project.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        // The populated owner ID is compared with the authenticated user's
        // ID to determine whether the caller owns this project.
        const isOwner = project.userId._id.equals(user._id);

        return {
            id: project._id,
            userId: project.userId._id,
            title: project.title,
            type: project.type,
            document: project.documentation,
            githubRepo: project.githubRepo,
            status: project.status,
            dueDate: project.dueDate,
            members: project.members,
            remainingDays,
            isOwner,
        };
    });
};

/**
 * Retrieves a specific project after confirming that the authenticated user
 * has access through either ownership or project membership.
 */
export const getProjectByIdService = async ({
    userId,
    projectId,
}: GetProjectByIdData) => {
    const user = await UserModel.findById(userId);

    if (!user) {
        throw new NotFoundError("User not found");
    }

    const project = await ProjectModel.findById(projectId).populate(
        // Populate member information so the caller receives member identities
        // rather than only their database references.
        "members",
        "_id username"
    );

    if (!project) {
        throw new NotFoundError("Project not found");
    }

    // Calculate the remaining time when the project is requested instead
    // of relying on a persisted value that would become outdated.
    const remainingDays = Math.ceil(
        (project.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    const isOwner = project.userId.equals(user._id);

    // Membership is checked independently from ownership because the owner
    // and assigned members have different relationships with the project.
    const isMember = (project.members ?? []).some((memberId) =>
        memberId.equals(user._id)
    );

    // Having a valid project ID alone does not grant access; the requester
    // must be either the owner or an assigned member.
    if (!isOwner && !isMember) {
        throw new ForbiddenError("You do not have access to this list");
    }

    return {
        id: project._id,
        userId: project.userId,
        title: project.title,
        type: project.type,
        document: project.documentation,
        githubRepo: project.githubRepo,
        status: project.status,
        dueDate: project.dueDate,
        members: project.members,
        remainingDays,
        isOwner,
    };
};

/**
 * Searches projects available to the authenticated user using optional
 * title, type, status, and due-date filters.
 *
 * Ownership/membership access is always included as the base condition,
 * while supplied filters further narrow the result set.
 */
export const getProjectSearchService = async ({
    userId,
    title,
    type,
    status,
    dueDate,
}: GetProjectSearchData) => {
    const user = await UserModel.findById(userId);

    if (!user) {
        throw new NotFoundError("User not found");
    }

    // Start every search with the access-control condition so additional
    // filters cannot accidentally expose projects belonging to other users.
    const conditions: Record<string, unknown>[] = [
        { $or: [{ userId: user._id }, { members: user._id }] },
    ];

    if (title) {
        // Case-insensitive partial matching allows users to search by a
        // portion of the project title rather than requiring an exact match.
        conditions.push({ title: { $regex: title.trim(), $options: "i" } });
    }

    if (type) {
        conditions.push({ type });
    }

    if (status) {
        conditions.push({ status });
    }

    if (dueDate) {
        // Convert the requested calendar date into the beginning of that day
        // so projects can be matched regardless of their stored time component.
        const startOfDay = new Date(dueDate);
        startOfDay.setHours(0, 0, 0, 0);

        // The upper bound is exclusive, covering the entire requested day
        // without including projects due at midnight on the following day.
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        conditions.push({ dueDate: { $gte: startOfDay, $lt: endOfDay } });
    }

    const projects = await ProjectModel.find(
        // Use $and only when additional filters were supplied; otherwise
        // the base ownership/membership condition can be queried directly.
        conditions.length > 1 ? { $and: conditions } : conditions[0]
    )
        .populate("userId", "_id username")
        .sort({ createdAt: -1 });

    return projects.map((project) => {
        // Recalculate the remaining days for the current request.
        const remainingDays = Math.ceil(
            (project.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        const isOwner = project.userId._id.equals(user._id);

        return {
            id: project._id,
            userId: project.userId._id,
            title: project.title,
            type: project.type,
            document: project.documentation,
            githubRepo: project.githubRepo,
            status: project.status,
            dueDate: project.dueDate,
            members: project.members,
            remainingDays,
            isOwner,
        };
    });
};

/**
 * Updates an existing project.
 *
 * Only the project owner can modify project information, while member
 * validation is re-applied whenever membership or project type changes.
 */
export const updateProjectService = async ({
    userId,
    projectId,
    title,
    type,
    documentation,
    githubRepo,
    dueDate,
    status,
    members,
}: UpdateProjectData) => {
    const user = await UserModel.findById(userId);
    if (!user) {
        throw new NotFoundError("User not found");
    }

    const project = await ProjectModel.findById(projectId);
    if (!project) {
        throw new NotFoundError("Project not found");
    }

    const isOwner = project.userId.equals(user._id);

    // Project modification is restricted to the owner; membership alone
    // grants access to the project but does not grant update permissions.
    if (!isOwner) {
        throw new ForbiddenError(
            "Only the project owner can update this project"
        );
    }

    // Build the update object dynamically so omitted optional fields remain
    // unchanged in the existing project document.
    const updateFields: Record<string, unknown> = {};

    if (title !== undefined) {
        updateFields.title = title;
    }

    if (documentation !== undefined) {
        updateFields.documentation = documentation;
    }

    if (githubRepo !== undefined) {
        updateFields.githubRepo = githubRepo;
    }

    if (status !== undefined) {
        updateFields.status = status;
    }

    // When no new type is supplied, retain the project's current type for
    // membership validation and any subsequent type-related logic.
    const resolvedType = type ?? project.type;
    const typeChanged = type !== undefined && type !== project.type;

    // Membership must be revalidated when members are explicitly changed
    // or when the project type changes because each type has different
    // membership requirements.
    if (members !== undefined || typeChanged) {
        const validatedMembers = await validateMembers(
            userId,
            resolvedType,
            members
        );
        updateFields.members = validatedMembers;
    }

    if (type !== undefined) {
        updateFields.type = resolvedType;
    }

    if (dueDate !== undefined) {
        const parsedDueDate = new Date(dueDate);

        // Reject invalid date input before performing date arithmetic
        // or persisting the value.
        if (isNaN(parsedDueDate.getTime())) {
            throw new BadRequestError("Invalid due date");
        }

        // Calculate the requested due date relative to the current time
        // so past dates cannot be assigned to the project.
        const remainingDays = Math.ceil(
            (parsedDueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        if (remainingDays < 0) {
            throw new BadRequestError("Due date cannot be in the past");
        }

        updateFields.dueDate = parsedDueDate;
    }

    // Reject an empty update request instead of performing a database
    // operation that would leave the project unchanged.
    if (Object.keys(updateFields).length === 0) {
        throw new BadRequestError(
            "At least one field must be provided to update"
        );
    }

    const updatedProject = await ProjectModel.findByIdAndUpdate(
        projectId,
        updateFields,
        { new: true }
    );

    if (!updatedProject) {
        throw new NotFoundError("Project not found");
    }

    // Calculate this derived value from the updated due date so the response
    // reflects the project's current state immediately after the update.
    const remainingDays = updatedProject.dueDate
        ? Math.ceil(
              (updatedProject.dueDate.getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24)
          )
        : undefined;

    return {
        id: updatedProject._id,
        userId: updatedProject.userId,
        title: updatedProject.title,
        documentation: updatedProject.documentation,
        githubRepo: updatedProject.githubRepo,
        status: updatedProject.status,
        type: updatedProject.type,
        dueDate: updatedProject.dueDate,
        members: updatedProject.members,
        remainingDays,
        isOwner,
    };
};

/**
 * Permanently deletes a project.
 *
 * Deletion is restricted to the project owner; members can access and leave
 * a shared project but cannot remove the project itself.
 */
export const deleteProjectService = async ({
    userId,
    projectId,
}: DeleteProjectData) => {
    const user = await UserModel.findById(userId);
    if (!user) {
        throw new NotFoundError("User not found");
    }

    const project = await ProjectModel.findById(projectId);
    if (!project) {
        throw new NotFoundError("Project not found");
    }

    // Project membership does not grant deletion authority; only the
    // stored project owner is allowed to permanently remove the project.
    if (!project.userId.equals(user._id)) {
        throw new ForbiddenError("Only the project owner can delete this list");
    }

    await ProjectModel.deleteOne({ _id: project._id });
};

/**
 * Retrieves projects that are shared with the authenticated user but are
 * owned by another user.
 *
 * This excludes personally owned projects from the shared-project result.
 */
export const getSharedProjectsService = async ({ userId }: GetProjectsData) => {
    const user = await UserModel.findById(userId);
    if (!user) {
        throw new NotFoundError("User not found");
    }

    const project = await ProjectModel.find({
        // The authenticated user must be explicitly assigned as a member.
        members: user._id,
        // Exclude projects where the authenticated user is also the owner.
        userId: { $ne: user._id },
    })
        // Only the owner's username is required for the shared-project response.
        .populate("userId", "username")
        .sort({ createdAt: -1 });

    return project.map((project) => {
        // Calculate remaining time at request time to keep the value current.
        const remainingDays = Math.ceil(
            (project.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        return {
            id: project._id,
            userId: project.userId._id,
            title: project.title,
            type: project.type,
            document: project.documentation,
            githubRepo: project.githubRepo,
            status: project.status,
            dueDate: project.dueDate,
            members: project.members,
            remainingDays,
        };
    });
};

/**
 * Removes the authenticated user from a project's member list.
 *
 * The project owner cannot leave because ownership is represented separately
 * from membership and is required for the project to remain manageable.
 */
export const leaveProjectService = async ({
    userId,
    projectId,
}: GetProjectByIdData) => {
    const project = await ProjectModel.findById(projectId);
    if (!project) {
        throw new NotFoundError("Project not found");
    }

    // Owners cannot use the member-leave operation because ownership is not
    // represented as a removable membership relationship.
    if (project.userId.equals(userId)) {
        throw new BadRequestError("The owner cannot leave the project.");
    }

    const members = project.members ?? [];

    // Determine whether the requester is actually assigned before attempting
    // to remove their membership.
    const isMember = members.some((member) => member.equals(userId));

    if (!isMember) {
        throw new BadRequestError("You are not a member of this project.");
    }

    // Remove only the authenticated user's membership while preserving all
    // other project members.
    project.members = members.filter((member) => !member.equals(userId));

    await project.save();
};

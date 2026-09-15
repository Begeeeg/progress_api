import {
    BadRequestError,
    ForbiddenError,
    NotFoundError,
} from "../../../../common/error/errorStatusCode";
import { validateMembers } from "../../../../common/utils/validateMembers";
import UserModel from "../../identity/user/user.model";
import ProjectModel from "./project.model";
import { ProjectRole, ProjectType } from "./types/project.enum";
import {
    CreateProjectData,
    GetProjectByIdData,
    GetProjectSearchData,
    GetProjectsData,
    UpdateProjectData,
} from "./types/project.types";

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

    const resolvedType = type ?? ProjectType.PERSONAL;

    const validatedMembers = await validateMembers(
        userId,
        resolvedType,
        members
    );

    const parsedDueDate = new Date(dueDate);

    if (isNaN(parsedDueDate.getTime())) {
        throw new BadRequestError("Invalid due date");
    }

    const remainingDays = Math.ceil(
        (parsedDueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (remainingDays < 0) {
        throw new BadRequestError("Due date cannot be in the past");
    }

    const project = await ProjectModel.create({
        userId,
        title,
        type,
        documentation,
        githubRepo,
        dueDate: parsedDueDate,
        status,
        members: validatedMembers,
        role: ProjectRole.OWNER,
    });

    return {
        title: project.title,
        type: project.type,
        document: project.documentation,
        githubRepo: project.githubRepo,
        status: project.status,
        dueDate: project.dueDate,
        members: project.members,
        role: project.role,
        remainingDays,
    };
};

export const getProjectsService = async ({ userId }: GetProjectsData) => {
    const user = await UserModel.findById(userId);

    if (!user) {
        throw new NotFoundError("User not found");
    }

    const project = await ProjectModel.find({
        $or: [{ userId: user._id }, { members: user._id }],
    })
        .populate("userId", "_id username")
        .sort({ createdAt: -1 });

    return project.map((project) => {
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
            role: project.role,
            remainingDays,
            isOwner,
        };
    });
};

export const getProjectByIdService = async ({
    userId,
    projectId,
}: GetProjectByIdData) => {
    const user = await UserModel.findById(userId);

    if (!user) {
        throw new NotFoundError("User not found");
    }

    const project = await ProjectModel.findById(projectId).populate(
        "members",
        "_id username"
    );

    if (!project) {
        throw new NotFoundError("Project not found");
    }
    const remainingDays = Math.ceil(
        (project.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    const isOwner = project.userId.equals(user._id);
    const isMember = (project.members ?? []).some((memberId) =>
        memberId.equals(user._id)
    );

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
        role: project.role,
        remainingDays,
        isOwner,
    };
};

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

    const conditions: Record<string, unknown>[] = [
        { $or: [{ userId: user._id }, { members: user._id }] },
    ];

    if (title) {
        conditions.push({ title: { $regex: title.trim(), $options: "i" } });
    }

    if (type) {
        conditions.push({ type });
    }

    if (status) {
        conditions.push({ status });
    }

    if (dueDate) {
        const startOfDay = new Date(dueDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        conditions.push({ dueDate: { $gte: startOfDay, $lt: endOfDay } });
    }

    const projects = await ProjectModel.find(
        conditions.length > 1 ? { $and: conditions } : conditions[0]
    )
        .populate("userId", "_id username")
        .sort({ createdAt: -1 });

    return projects.map((project) => {
        const remainingDays = Math.ceil(
            (project.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        const ownerId = project.userId._id;
        const isOwner = ownerId.equals(user._id);
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
            role: project.role,
            remainingDays,
            isOwner,
        };
    });
};

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
    if (!isOwner) {
        throw new ForbiddenError(
            "Only the project owner can update this project"
        );
    }

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

    const resolvedType = type ?? project.type;
    const typeChanged = type !== undefined && type !== project.type;

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

        if (isNaN(parsedDueDate.getTime())) {
            throw new BadRequestError("Invalid due date");
        }

        const remainingDays = Math.ceil(
            (parsedDueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        if (remainingDays < 0) {
            throw new BadRequestError("Due date cannot be in the past");
        }

        updateFields.dueDate = parsedDueDate;
    }

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

import {
    BadRequestError,
    NotFoundError,
} from "../../../../common/error/errorStatusCode";
import { validateMembers } from "../../../../common/utils/validateMembers";
import UserModel from "../../identity/user/user.model";
import ProjectModel from "./project.model";
import { ProjectRole, ProjectType } from "./types/project.enum";
import { CreateProjectData, GetProjectData } from "./types/project.types";

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

export const getProjectService = async ({ userId }: GetProjectData) => {
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

import { ProjectRole, ProjectStatus, ProjectType } from "./project.enum";

export interface CreateProjectData {
    userId: string;
    title: string;
    type: ProjectType;
    documentation?: string;
    githubRepo?: string;
    dueDate: Date;
    status: ProjectStatus;
    members?: string[];
    role: ProjectRole;
}

export interface GetProjectsData {
    userId: string;
}

export interface GetProjectByIdData {
    userId: string;
    projectId: string;
}

export interface GetProjectSearchData {
    userId: string;
    title?: string;
    type?: ProjectType;
    status?: ProjectStatus;
    dueDate?: Date;
}

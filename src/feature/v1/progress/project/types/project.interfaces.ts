import { Types } from "mongoose";
import { ProjectRole, ProjectStatus, ProjectType } from "./project.enum";

export interface IProject {
    userId: Types.ObjectId;
    title: string;
    type: ProjectType;
    documentation: string;
    githubRepo: string;
    dueDate: Date;
    status: ProjectStatus;
    workload: number;
    members?: string[];
    role: ProjectRole;
}

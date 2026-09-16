import { Types } from "mongoose";
import { ProjectStatus, ProjectType } from "./project.enum";

export interface IProject {
    userId: Types.ObjectId;
    title: string;
    type: ProjectType;
    documentation?: string;
    githubRepo?: string;
    dueDate: Date;
    status: ProjectStatus;
    members?: Types.ObjectId[];
}

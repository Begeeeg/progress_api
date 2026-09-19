import { TaskStatus } from "./task.enum";

export interface CreateTaskData {
    userId: string;
    projectId: string;
    title: string;
    notes?: string;
    status: TaskStatus;
    deadline: Date;
    assignedTo?: string[];
}

export interface GetTasksData {
    userId: string;
    projectId: string;
}

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

export interface GetTaskByIdData {
    userId: string;
    projectId: string;
    taskId: string;
}

export interface UpdateTaskData {
    userId: string;
    projectId: string;
    taskId: string;
    title?: string;
    notes?: string;
    status?: TaskStatus;
    deadline?: Date;
    assignedTo?: string[];
}

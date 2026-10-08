import express from "express";
import { protectRoutes } from "../../../../common/middleware/protectRoutes";
import {
    createTaskController,
    deleteTaskController,
    getTaskByIdController,
    getTasksController,
    leaveTaskController,
    updateTaskController,
} from "./task.controller";
import { createTaskSchema } from "./dtos/create.data.dto";
import { validate } from "../../../../common/middleware/validatorDataDto";
import { updateTaskSchema } from "./dtos/update.data.dto";

// mergeParams lets this router read `:projectId` from the parent
// project router it's mounted under (see project.router.ts:
// `router.use("/:projectId/task", taskRouter)`). Paths below are relative
// to that mount point, so they only need to declare their own `:taskId`.
const router = express.Router({ mergeParams: true });

router.post(
    "/",
    protectRoutes,
    validate(createTaskSchema),
    createTaskController,
);
router.get("/", protectRoutes, getTasksController);
router.get("/:taskId", protectRoutes, getTaskByIdController);
router.patch(
    "/:taskId",
    protectRoutes,
    validate(updateTaskSchema),
    updateTaskController,
);
router.delete("/:taskId", protectRoutes, deleteTaskController);
router.delete("/:taskId/leave", protectRoutes, leaveTaskController);

export default router;

import express from "express";
import { protectRoutes } from "../../../../common/middleware/protectRoutes";
import {
    createTaskController,
    getTaskByIdController,
    getTasksController,
    updateTaskController,
} from "./task.controller";
import { createTaskSchema } from "./dtos/create.data.dto";
import { validate } from "../../../../common/middleware/validatorDataDto";
import { updateTaskSchema } from "./dtos/update.data.dto";

const router = express.Router();

router.post(
    "/",
    protectRoutes,
    validate(createTaskSchema),
    createTaskController,
);
router.get("/", protectRoutes, getTasksController);
router.get("/id", protectRoutes, getTaskByIdController);
router.patch(
    "/id",
    protectRoutes,
    validate(updateTaskSchema),
    updateTaskController,
);

export default router;

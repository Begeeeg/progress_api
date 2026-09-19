import express from "express";
import { protectRoutes } from "../../../../common/middleware/protectRoutes";
import {
    createTaskController,
    getTaskByIdController,
    getTasksController,
} from "./task.controller";
import { createTaskSchema } from "./dtos/create.data.dto";
import { validate } from "../../../../common/middleware/validatorDataDto";

const router = express.Router();

router.post(
    "/",
    protectRoutes,
    validate(createTaskSchema),
    createTaskController,
);
router.get("/", protectRoutes, getTasksController);
router.get("/id", protectRoutes, getTaskByIdController);

export default router;

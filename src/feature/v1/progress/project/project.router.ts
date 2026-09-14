import express from "express";
import { protectRoutes } from "../../../../common/middleware/protectRoutes";
import { CreateProjectSchema } from "./dtos/create.data.dto";
import {
    createProjectController,
    getProjectController,
} from "./project.controller";
import { validate } from "../../../../common/middleware/validatorDataDto";

const router = express.Router();

router.post(
    "/",
    protectRoutes,
    validate(CreateProjectSchema),
    createProjectController
);

router.get("/", protectRoutes, getProjectController);

export default router;

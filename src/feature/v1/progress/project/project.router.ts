import express from "express";
import { protectRoutes } from "../../../../common/middleware/protectRoutes";
import { CreateProjectSchema } from "./dtos/create.data.dto";
import {
    createProjectController,
    deleteProjectController,
    getProjectByIdController,
    getProjectsController,
    getProjectSearchController,
    getSharedProjectController,
    leaveProjectController,
    updateProjectController,
} from "./project.controller";
import { validate } from "../../../../common/middleware/validatorDataDto";
import { UpdateProjectSchema } from "./dtos/update.data.dto";

const router = express.Router();

router.post(
    "/",
    protectRoutes,
    validate(CreateProjectSchema),
    createProjectController
);

router.get("/", protectRoutes, getProjectsController);

router.get("/search", protectRoutes, getProjectSearchController);

router.get("/getbyid", protectRoutes, getProjectByIdController);

router.patch(
    "/update",
    protectRoutes,
    validate(UpdateProjectSchema),
    updateProjectController
);

router.delete("/delete", protectRoutes, deleteProjectController);

router.get("/shared", protectRoutes, getSharedProjectController);

router.delete("/leave", protectRoutes, leaveProjectController);

export default router;

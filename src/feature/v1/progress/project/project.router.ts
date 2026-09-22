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
import { taskRouter } from "../task";

const router = express.Router();

router.post(
    "/",
    protectRoutes,
    validate(CreateProjectSchema),
    createProjectController,
);

router.get("/", protectRoutes, getProjectsController);

// Static paths must be registered before the "/:projectId" catch-all below,
// or Express will try to match "search"/"shared" as a projectId value.
router.get("/search", protectRoutes, getProjectSearchController);

router.get("/shared", protectRoutes, getSharedProjectController);

router.get("/:projectId", protectRoutes, getProjectByIdController);

router.patch(
    "/:projectId",
    protectRoutes,
    validate(UpdateProjectSchema),
    updateProjectController,
);

router.delete("/:projectId", protectRoutes, deleteProjectController);

router.delete("/:projectId/leave", protectRoutes, leaveProjectController);

// Tasks are a nested resource under a project: /:projectId/task/...
// `mergeParams` on taskRouter (see task.router.ts) lets it read
// `:projectId` from this parent route.
router.use("/:projectId/task", taskRouter);

export default router;

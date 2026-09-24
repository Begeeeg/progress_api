import express from "express";
import { protectRoutes } from "../../../../common/middleware/protectRoutes";
import {
    githubCallbackController,
    githubConnectController,
} from "./github.controller";

const router = express.Router({ mergeParams: true });

router.get("/connect", protectRoutes, githubConnectController);
router.get("/callback", protectRoutes, githubCallbackController);

export default router;

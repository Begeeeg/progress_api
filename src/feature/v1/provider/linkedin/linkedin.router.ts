import express from "express";
import { protectRoutes } from "../../../../common/middleware/protectRoutes";
import {
    linkedinCallbackController,
    linkedinConnectController,
} from "./linkedin.controller";

const router = express.Router();

router.get("/connect", protectRoutes, linkedinConnectController);
router.get("/callback", protectRoutes, linkedinCallbackController);

export default router;

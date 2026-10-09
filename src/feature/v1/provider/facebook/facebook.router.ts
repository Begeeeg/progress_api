import express from "express";
import { protectRoutes } from "../../../../common/middleware/protectRoutes";
import {
    facebookCallbackController,
    facebookConnectController,
} from "./facebook.controller";

const router = express.Router();

router.get("/connect", protectRoutes, facebookConnectController);
router.get("/callback", protectRoutes, facebookCallbackController);

export default router;

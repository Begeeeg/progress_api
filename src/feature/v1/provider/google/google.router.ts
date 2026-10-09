import express from "express";
import { protectRoutes } from "../../../../common/middleware/protectRoutes";
import {
    googleCallbackController,
    googleConnectController,
} from "./google.controller";

const router = express.Router();

router.get("/connect", protectRoutes, googleConnectController);
router.get("/callback", protectRoutes, googleCallbackController);

export default router;

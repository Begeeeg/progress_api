import express from "express";
import { facebookRouter } from "../../provider/facebook";
import { githubRouter } from "../../provider/github";
import { googleRouter } from "../../provider/google";
import { linkedinRouter } from "../../provider/linkedin";
import { protectRoutes } from "../../../../common/middleware/protectRoutes";
import {
    deleteAccountController,
    getAccountController,
    getAccountsController,
} from "./account.controller";

const router = express.Router();

router.get("/", protectRoutes, getAccountsController);
router.get("/:provider", protectRoutes, getAccountController);
router.delete("/:provider", protectRoutes, deleteAccountController);

router.use("/facebook", facebookRouter);
router.use("/github", githubRouter);
router.use("/google", googleRouter);
router.use("/linkedin", linkedinRouter);

export default router;

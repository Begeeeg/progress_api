import express from "express";
import {
    getUserController,
    updatePasswordController,
    updateUserInfoController,
} from "./user.controller";
import { protectRoutes } from "../../../../common/middleware/protectRoutes";
import { validate } from "../../../../common/middleware/validatorDataDto";
import { UpdateUserInfoSchema } from "./dtos/updateInfo.data.dto";
import { UpdatePasswordSchema } from "./dtos/updatePassword.data.dto";

const router = express.Router();

router.get("/me", protectRoutes, getUserController);
router.patch(
    "/update-info",
    protectRoutes,
    validate(UpdateUserInfoSchema),
    updateUserInfoController
);
router.patch(
    "/update-password",
    protectRoutes,
    validate(UpdatePasswordSchema),
    updatePasswordController
);

export default router;

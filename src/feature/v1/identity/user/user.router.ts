import express from "express";
import {
    deleteUserController,
    getUserController,
    searchUsersController,
    updatePasswordController,
    updateUserInfoController,
} from "./user.controller";
import { protectRoutes } from "../../../../common/middleware/protectRoutes";
import { validate } from "../../../../common/middleware/validatorDataDto";
import { UpdateUserInfoSchema } from "./dtos/updateInfo.data.dto";
import { UpdatePasswordSchema } from "./dtos/updatePassword.data.dto";
import { DeleteUserSchema } from "./dtos/deleteUser.data.dto";

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
router.get("/search", searchUsersController);
router.delete(
    "/me",
    protectRoutes,
    validate(DeleteUserSchema),
    deleteUserController
);

export default router;

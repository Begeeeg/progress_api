import express from "express";
import { getUserController, updateUserInfoController } from "./user.controller";
import { protectRoutes } from "../../../../common/middleware/protectRoutes";
import { validate } from "../../../../common/middleware/validatorDataDto";
import { UpdateUserInfoSchema } from "./dtos/updateInfo.data.dto";

const router = express.Router();

router.get("/me", protectRoutes, getUserController);
router.patch(
    "/update-info",
    protectRoutes,
    validate(UpdateUserInfoSchema),
    updateUserInfoController
);

export default router;

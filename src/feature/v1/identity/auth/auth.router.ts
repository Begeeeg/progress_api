import express from "express";
import { registerController } from "./auth.controller";
import { validate } from "../../../../common/middleware/validatorDataDto";
import { RegisterUserSchema } from "./dtos/register.data.dto";

const router = express.Router();

router.post("/register", validate(RegisterUserSchema), registerController);

export default router;

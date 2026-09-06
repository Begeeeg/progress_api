import express from "express";
import { registerController, verifyEmailController } from "./auth.controller";
import { validate } from "../../../../common/middleware/validatorDataDto";
import { RegisterUserSchema } from "./dtos/register.data.dto";

const router = express.Router();

router.post("/register", validate(RegisterUserSchema), registerController);
router.get("/verify-email", verifyEmailController);

export default router;

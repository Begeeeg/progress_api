import { Router } from "express";
import { authRouter } from "./feature/v1/identity/auth";
import { userRouter } from "./feature/v1/identity/user";

const router = Router();

router.use("/identity/auth", authRouter);
router.use("/identity/user", userRouter);

export default router;

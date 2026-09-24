import { Router } from "express";
import { authRouter } from "./feature/v1/identity/auth";
import { userRouter } from "./feature/v1/identity/user";
import { projectRouter } from "./feature/v1/progress/project";
import { accountRouter } from "./feature/v1/identity/account";

const router = Router();

router.use("/identity/auth", authRouter);
router.use("/identity/user", userRouter);
router.use("/identity/account", accountRouter);
router.use("/progress/project", projectRouter);

export default router;

import express from "express";
import { githubRouter } from "../../provider/github";

const router = express.Router();

router.use("/github", githubRouter);

export default router;

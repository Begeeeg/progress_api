import { Request } from "express";
import { UserDocument } from "../feature/v1/identity/user/user.model";

declare global {
    namespace Express {
        interface Request {
            user?: UserDocument;
        }
    }
}

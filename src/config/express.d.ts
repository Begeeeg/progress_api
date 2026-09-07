import { Request } from "express";
import { IUser } from "../feature/v1/identity/user/types/user.interfaces";

declare global {
    namespace Express {
        interface Request {
            user?: IUser;
        }
    }
}

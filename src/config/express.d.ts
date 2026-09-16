import { Request } from "express";

import { UserDocument } from "../feature/v1/identity/user/user.model";

/**
 * Extends Express's Request type so authentication middleware can attach
 * the authenticated user's database document to `req.user`.
 */
declare global {
    namespace Express {
        interface Request {
            // Optional because unauthenticated requests do not have a user
            // attached, while authentication middleware assigns it when valid.
            user?: UserDocument;
        }
    }
}

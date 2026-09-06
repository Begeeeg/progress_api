import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

export const validate =
    (schema: ZodSchema) =>
    (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            const { fieldErrors } = result.error.flatten();
            const firstError = Object.values(fieldErrors).flat()[0];

            res.status(400).json({
                message: firstError || "Validation failed",
                errors: fieldErrors,
            });
            return;
        }

        req.body = result.data;
        next();
    };

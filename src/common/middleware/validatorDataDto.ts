import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

/**
 * Creates middleware that validates request bodies against a Zod schema
 * before allowing the request to reach the controller.
 *
 * The parsed result is assigned back to `req.body` so downstream handlers
 * receive the schema-validated and potentially transformed data.
 */
export const validate =
    (schema: ZodSchema) =>
    (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            // Return the first field error as the primary message while
            // preserving all field-level errors for clients that need them.
            const { fieldErrors } = result.error.flatten();
            const firstError = Object.values(fieldErrors).flat()[0];

            res.status(400).json({
                message: firstError || "Validation failed",
                errors: fieldErrors,
            });
            return;
        }

        // Use Zod's parsed output so downstream code works with validated
        // data and any transformations defined by the schema.
        req.body = result.data;
        next();
    };

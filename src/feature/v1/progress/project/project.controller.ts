import { Request, Response } from "express";
import * as projectService from "./project.service";
import { BadRequestError } from "../../../../common/error/errorStatusCode";
import { ProjectStatus, ProjectType } from "./types/project.enum";

/**
 * Creates a new project for the authenticated user.
 *
 * Project ownership is derived from the authenticated request rather than
 * from client-provided data.
 */
export const createProjectController = async (
    req: Request,
    res: Response
): Promise<void> => {
    // Ensure the controller only operates on an authenticated account.
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const project = await projectService.createProjectService({
        // Use the authenticated user's ID as the project owner.
        userId: req.user._id.toString(),
        title: req.body.title,
        type: req.body.type,
        documentation: req.body.documentation,
        githubRepo: req.body.githubRepo,
        dueDate: req.body.dueDate,
        status: req.body.status,
        members: req.body.members,
    });

    res.status(201).json({
        message: "Created list successfully",
        data: project,
    });
};

/**
 * Retrieves all projects that the authenticated user owns or participates in.
 */
export const getProjectsController = async (
    req: Request,
    res: Response
): Promise<void> => {
    // Prevent unauthenticated requests from reaching the service layer.
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const projects = await projectService.getProjectsService({
        // Scope the query to the authenticated user's projects.
        userId: req.user._id.toString(),
    });

    res.status(200).json({
        message: "Fetched lists successfully",
        data: projects,
    });
};

/**
 * Retrieves a specific project after the service verifies that the
 * authenticated user has access to it.
 */
export const getProjectByIdController = async (
    req: Request,
    res: Response
): Promise<void> => {
    // Project access requires an authenticated user.
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const { projectId } = req.query;

    // Express query parameters are not guaranteed to be strings, so validate
    // the value before passing it to the service layer.
    if (typeof projectId !== "string") {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }

    const project = await projectService.getProjectByIdService({
        userId: req.user._id.toString(),
        projectId,
    });

    res.status(200).json({
        message: "Fetched list successfully",
        data: project,
    });
};

/**
 * Searches projects belonging to or shared with the authenticated user.
 *
 * Optional filters are validated here before being passed to the service,
 * keeping request-specific validation at the controller boundary.
 */
export const getProjectSearchController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const { title, type, status, dueDate } = req.query;

    // Query parameters can contain non-string values, so validate the title
    // before allowing it to reach the search service.
    if (title !== undefined && typeof title !== "string") {
        throw new BadRequestError("Invalid title filter");
    }

    // Restrict the type filter to the application's defined project types
    // rather than accepting arbitrary values from the client.
    if (
        type !== undefined &&
        (typeof type !== "string" ||
            !Object.values(ProjectType).includes(type as ProjectType))
    ) {
        throw new BadRequestError(
            `Invalid type filter. Must be one of: ${Object.values(
                ProjectType
            ).join(", ")}`
        );
    }

    // Restrict the status filter to known project statuses so invalid values
    // cannot be used as search criteria.
    if (
        status !== undefined &&
        (typeof status !== "string" ||
            !Object.values(ProjectStatus).includes(status as ProjectStatus))
    ) {
        throw new BadRequestError(
            `Invalid status filter. Must be one of: ${Object.values(
                ProjectStatus
            ).join(", ")}`
        );
    }

    let parsedDueDate: Date | undefined;
    if (dueDate !== undefined) {
        // Validate the query parameter type before attempting date parsing.
        if (typeof dueDate !== "string") {
            throw new BadRequestError("Invalid dueDate filter");
        }

        // Convert the query value into a Date so the service receives a
        // consistent date representation rather than raw request data.
        parsedDueDate = new Date(dueDate);

        // Date parsing can produce an invalid Date without throwing, so
        // explicitly verify the resulting timestamp.
        if (isNaN(parsedDueDate.getTime())) {
            throw new BadRequestError("Invalid dueDate filter");
        }
    }

    const projects = await projectService.getProjectSearchService({
        userId: req.user._id.toString(),
        title: title as string | undefined,
        type: type as ProjectType | undefined,
        status: status as ProjectStatus | undefined,
        dueDate: parsedDueDate,
    });

    res.status(200).json({
        message: "Fetched lists successfully",
        data: projects,
    });
};

/**
 * Updates an existing project owned by the authenticated user.
 *
 * Authorization and project-specific business rules are enforced by
 * the service layer.
 */
export const updateProjectController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const { projectId } = req.query;

    // Require a single project ID before forwarding the request to the service.
    if (typeof projectId !== "string") {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }

    const project = await projectService.updateProjectService({
        // The authenticated user determines which account is attempting
        // the update; the client cannot choose another user's ID.
        userId: req.user._id.toString(),
        projectId,
        title: req.body.title,
        type: req.body.type,
        documentation: req.body.documentation,
        githubRepo: req.body.githubRepo,
        dueDate: req.body.dueDate,
        status: req.body.status,
        members: req.body.members,
    });

    res.status(200).json({
        message: "Updated list successfully",
        data: project,
    });
};

/**
 * Permanently deletes a project owned by the authenticated user.
 *
 * The service layer performs the ownership check before deletion.
 */
export const deleteProjectController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const { projectId } = req.query;

    // Validate the project identifier before passing it to the service.
    if (typeof projectId !== "string") {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }

    await projectService.deleteProjectService({
        // Always derive the requesting user's identity from authentication.
        userId: req.user._id.toString(),
        projectId,
    });

    res.status(200).json({
        message: "Deleted project successfully",
    });
};

/**
 * Retrieves projects that are shared with the authenticated user and owned
 * by another user.
 */
export const getSharedProjectController = async (
    req: Request,
    res: Response
) => {
    if (!req.user) {
        return res.status(401).json({
            message: "Unauthorized",
        });
    }

    const projects = await projectService.getSharedProjectsService({
        // The authenticated user determines which shared projects are returned.
        userId: req.user._id.toString(),
    });

    res.status(200).json({
        // Provide a more specific response message when the user has no
        // shared projects while keeping the response shape consistent.
        message:
            projects.length === 0
                ? "No shared projects"
                : "Shared projects fetched successfully",
        data: projects,
    });
};

/**
 * Removes the authenticated user from a project they are a member of.
 *
 * The service layer prevents the project owner from using this operation.
 */
export const leaveProjectController = async (
    req: Request,
    res: Response
): Promise<void> => {
    if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }

    const { projectId } = req.query;

    // Ensure the project identifier is a single string before calling the service.
    if (typeof projectId !== "string") {
        res.status(400).json({ message: "Invalid project id" });
        return;
    }

    await projectService.leaveProjectService({
        // The service uses the authenticated identity to remove the correct
        // member rather than accepting a user ID from the client.
        userId: req.user._id.toString(),
        projectId,
    });

    res.status(200).json({
        message: "Left project successfully",
    });
};

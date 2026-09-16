import nodemailer from "nodemailer";

import dotenv from "dotenv";

dotenv.config({ quiet: true });

/**
 * Configures the shared SMTP transporter used by the application's
 * email services to send transactional messages.
 *
 * SMTP connection details are loaded from environment variables so
 * credentials and deployment-specific configuration are not hardcoded.
 */
export const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,

    // Convert the environment variable from a string to the numeric
    // port value expected by the SMTP transport configuration.
    port: Number(process.env.SMTP_PORT),

    // Uses a non-TLS connection at transport setup; the SMTP server may
    // still support upgrading the connection through STARTTLS.
    secure: false,

    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

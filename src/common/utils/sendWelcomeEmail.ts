import { transporter } from "../../config/mailer";

/**
 * Sends a welcome email after the user's email address has been verified.
 *
 * Provides the newly activated account with a direct link to the client
 * application to continue using the service.
 */
export const sendWelcomeEmail = async (email: string, username: string) => {
    await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: email,
        subject: "Welcome aboard!",
        html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                <h2>Welcome ${username}!</h2>
                <p>Your email has been verified and your account is now active. We're glad to have you.</p>
                <a href="${process.env.CLIENT_URL}" style="display:inline-block;padding:10px 20px;background:#000;color:#fff;text-decoration:none;border-radius:6px;">
                    Get Started
                </a>
            </div>
        `,
    });
};

import { transporter } from "../../config/mailer";

export const sendVerificationEmail = async (
    email: string,
    username: string,
    token: string
) => {
    const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

    await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: email,
        subject: "Verify your email",
        html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                <h1>Dear ${username},</h1>
                <h2>Verify your email</h2>
                <p>Thanks for signing up! Click the button below to verify your email address. This link expires in 15 minutes.</p>
                <a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#000;color:#fff;text-decoration:none;border-radius:6px;">
                    Verify Email
                </a>
                <p style="color:#666;font-size:12px;margin-top:20px;">
                    If you didn't create an account, you can safely ignore this email.
                </p>
            </div>
        `,
    });
};

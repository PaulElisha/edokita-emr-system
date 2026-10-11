import Mail from 'nodemailer/lib/mailer/index.js';
import { MailForwarder } from '../config/MailForwarder';
import { AuthService } from '../services/AuthService.js';

class AuthController {

    constructor() {
        this.authService = new AuthService();
    }

    registerUser = async (req, res) => {
        const text = {
            subject: "<h1>Welcome to Our Service</h1>",
            message: `<p>Hello ${req.body.username}, welcome to our service!</p>`
        }

        const forwarder = new MailForwarder(text);

        try {
            await this.authService.registerUser(req.body);

            forwarder.sendMail(req, res);

            res.status(201).json({ message: "User created successfully", status: "ok" });
        } catch (error) {
            console.error("Error creating User:", error);
            res.status(500).json({ message: "Internal Server Error", status: "error" });
        }
    }

    logoutUser = async (req, res) => {
        try {
            res.clearCookie('token', this.authService.logoutUser)

            res.status(200).json({ message: "Logout successful", status: "ok" });
        } catch (error) {
            res.status(500).json({ message: error.message, status: "error" });
        }
    }

    loginUser = async (req, res) => {
        const text = {
            subject: "Login Alert",
            message: `Hello ${req.body.username}, you have successfully logged in! If this wasn't you, please secure your account immediately.`
        }

        const forwarder = new MailForwarder(text);
        try {
            const token = await this.authService.loginUser(req.body);

            forwarder.sendMail(req, res);

            return res
                .cookie("token", token, { httpOnly: true, sameSite: "strict" })
                .status(200)
                .json({ status: "ok", message: "Login successful" });

        } catch (error) {
            return res.status(500).json({ status: "error", error: error.message });
        }
    }

    resetPassword = async (req, res) => {
        try {
            const token = await this.authService.resetPassword(req.body);

            const text = {
                subject: `<h1>Password Reset Request</h1>`,
                message: `<p>
                        Click on the link to reset your password
                        <a href="https://localhost:3000/password/reset/request/${token}">Reset Password</a>
                    </p>`
            }
            const forwarder = new MailForwarder(text);

            forwarder.sendMail(req, res);
            res.status(200).json({ message: "Password reset successful", status: "ok" });
        } catch (error) {
            res.status(500).json({ message: error.message, status: "error" });
        }
    }

    resetPasswordRequest = async (req, res) => {
        try {
            await this.authService.resetPasswordRequest(req.body, req.params.token);
            return res.status(200).json({ message: "Password has been reset", status: "ok" });
        } catch (error) {
            return res.status(500).json({ message: error.message, status: "error" });
        }
    }
}

export { AuthController }
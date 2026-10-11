import { MailForwarder } from '../config/MailForwarder.js';
import { OtpService } from '../services/OtpService.js';

class OtpController {
    constructor() {
        this.otpService = new OtpService();
    }

    verifyUserOTP = async (req, res) => {
        let { otp } = req.body;
        let { userId } = req.user._id;

        const body = { otp, userId };

        try {
            await this.otpService.verifyUserOTP(body);
            res.status(200).json({ message: "User verified successfully", status: "ok" });
        } catch (error) {
            return res.status(500).json({ status: "error", error: error.message });
        }
    }

    resendUserOTP = async (req, res) => {
        try {
            const user = await this.otpService.resendUserOTP(req.body);
            if (!user) {
                return res.status(400).json({ message: "Could not resend OTP", status: "error" });
            }

            const text = {
                subject: "<h1>Resend OTP</h1>",
                message: `<p>Your new OTP ${user.otp} has been resent successfully. Kindly, proceed to verify as otp expires in ${user.otpExpired} minutes</p>`
            }

            const forwarder = new MailForwarder(text);
            forwarder.sendMail(req, res);

            res.status(200).json({ message: "OTP resent successfully", status: "ok" });
        } catch (error) {
            return res.status(error.statusCode || 500).json({ status: "error", error: error.message });
        }
    }
}

export { OtpController }
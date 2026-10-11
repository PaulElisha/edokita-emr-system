import User from '../models/User.js';
import { generateUserOtp } from '../utils/generateUtils.js';
class OtpService {

    verifyUserOTP = async (body) => {
        const { otp, userId } = body;

        if (!otp) {
            const error = new Error("OTP is required");
            error.statusCode = 400;
            throw error;
        }

        if (user.otp !== otp) {
            const error = new Error("Invalid or Expired OTP");
            error.statusCode = 400;
            throw error;
        }

        const user = await User.findOne({ userId, otp, otpExpired: { $gt: Date.now() } });
        if (!user) {
            const error = new Error("User not found");
            error.statusCode = 400;
            throw error;
        }

        if (user.isVerified) {
            const error = new Error("User already verified");
            error.statusCode = 400;
            throw error;
        }

        user.isVerified = true;
        user.otp = null;
        user.otpExpired = null;

        await user.save();
    }

    resendUserOTP = async ({ gmail }) => {
        const user = await User.findOne({ gmail });
        if (!user) {
            const error = new Error("User not found");
            error.statusCode = 400;
            throw error;
        }

        if (user.isVerified) {
            const error = new Error("User already verified");
            error.statusCode = 400;
            throw error;
        }

        const currentTime = Date.now();

        if (user.lastOtpRequest && (currentTime - user.lastOtpRequest) < 5 * 60000) {
            const timeLeft = Math.ceil((60000 - (currentTime - user.lastOtpRequest)) / 1000);
            const error = new Error(`Please wait ${timeLeft} seconds before requesting a new OTP`);
            error.statusCode = 400;
            throw error;
        }

        const { otp, otpExpired } = generateUserOtp();

        user.otp = otp;
        user.otpExpired = otpExpired;
        user.lastOtpRequest = currentTime;

        await user.save();
        return user;
    }
}

export { OtpService }
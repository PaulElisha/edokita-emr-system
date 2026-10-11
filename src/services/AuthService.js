import bcrypt from "bcryptjs";
import Crypto from "crypto";

import { generateUserToken, generateUserOtp } from "../utils/generateUtils";
import User from "../models/User";


class AuthService {


    registerUser = async (userData) => {

        const { otp, otpExpired } = generateUserOtp();

        const foundUser = await User.findOne({ email: userData.email.toLowerCase() });
        if (foundUser) {
            const error = new Error('User with this email already exists');
            error.statusCode = 400;
            throw error;
        }
        const user = User.create({ ...userData, otp, otpExpired });
        if (!user) {
            const error = new Error('User creation failed');
            error.statusCode = 500;
            throw error;
        }
    }

    loginUser = async (loginDetails) => {

        const user = await User.findOne({ email: loginDetails.email.toLowerCase() })

        if (!user) {
            const error = new Error("User not found. Register User");
            error.statusCode = 404;
            throw error;
        }

        user.comparePassword(loginDetails.password, (err, isMatch) => {
            if (err || !isMatch) {
                const error = new Error('Invalid email or password');
                error.statusCode = 401;
                throw error
            }
        });

        const token = generateUserToken(user);

        return token;
    }

    logoutUser = () => {
        return {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        }
    };

    resetPassword = async ({ email }) => {
        const user = await User.findOne({ email });

        if (!user) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        const token = Crypto.randomBytes(20).toString('hex');
        user.passwordResetToken = token;
        user.passwordResetExpires = Date.now() + 20 * 60 * 1000;
        await user.save();

        return token;
    }

    resetPasswordRequest = async (newPassword, token) => {
        const user = await User.findOne({
            passwordResetToken: token,
            passwordResetExpires: { $gt: Date.now() }
        });

        if (!user) {
            const error = new Error("Invalid or expired token");
            error.statusCode = 400;
            throw error;
        }

        user.password = bcrypt.hashSync(newPassword, 10);
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();
    }
}

export { AuthService }
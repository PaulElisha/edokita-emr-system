import jwt from "jsonwebtoken";
import Crypto from "crypto";

export const generateUserToken = (user) => {
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    return token;
}

export const generateUserOtp = () => {
    return {
        otp: Math.floor(100000 + Math.random() * 900000).toString(),
        otpExpired: Date.now() + 10 * 60 * 1000, // 10 minutes from now
        token: Crypto.randomBytes(32).toString('hex')
    }
}


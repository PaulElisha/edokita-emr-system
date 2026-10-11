import jwt from 'jsonwebtoken'
import User from '../models/User'

import { config } from "dotenv";
config({ path: ".env" });

class Authorization {

    authorize = async (req, res, next) => {
        const accessToken = req.cookies?.token;

        if (!accessToken) {
            return res.status(200).json({ mesage: 'Please login first' });
        }

        try {
            const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);

            if (!decoded) {
                return res.status(401).json({ message: "Invalid token" });
            }

            req.user = await User.findById(decoded.id).select('-password');

            if (!req.user) return rss.status(401).json({ message: "User not found" });
            next();
        } catch (error) {
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    }
}


export { Authorization }
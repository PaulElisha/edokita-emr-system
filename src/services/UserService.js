import User from "../models/User";
import { generateUserOtp } from "../utils/generateUtils.js";

class UserService {

    getUsers = async () => {
        const users = await User.find({}).select('-password');
        if (users.length === 0) {
            const error = new Error("No users found");
            error.statusCode = 404;
            throw error;
        }
        return users;
    }

    getUser = async () => {
        const user = await User.findById(id);
        if (!user) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }
        return user;
    }

    updateUser = async (id, data) => {
        const user = await User.findByIdAndUpdate(id, data, { new: true });
        if (!user) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }
        return user;
    }

    updateUserProfile = async (id, data) => {
        const user = await User.findByIdAndUpdate(id, {
            $set: {
                'profile.country': data.country,
                'profile.number': data.number,
                'profile.street': data.street,
                'profile.bio': data.bio
            }
        }, { new: true });
        if (!user) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        return user;
    }

    deleteUser = async (id) => {
        const user = await User.findByIdAndDelete(id);
        if (user !== null || user !== undefined) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }
    }
}

export { UserService }
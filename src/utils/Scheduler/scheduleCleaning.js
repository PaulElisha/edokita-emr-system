import { User } from "../../models/User";
import cronScheduler from "../cronSchedule.js";

export const scheduleCleaning = () => {
    cronScheduler("0 0 * * *", async () => {
        try {
            const result = await User.deleteMany({ isVerified: false, createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
            console.log(`Deleted ${result.deletedCount} unverified users`);
        } catch (error) {
            console.error("Error during scheduled cleaning of unverified users:", error);
        }
    });
}
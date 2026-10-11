import mongoose from "mongoose";

class connectDB {

    constructor() {
        this.connectDb();
    }

    connectDb() {
        try {
            mongoose.connect(process.env.MONGODB_URI);
            mongoose.connection.on("connected", () => { console.log("MongoDB connected successfully"); });
        } catch (error) {
            console.error("Error connecting to MongoDB:", error.message);
            mongoose.connection.on("error", (err) => {
                console.error("Error connection failed:", err.message);
            });
        }
    }
}
export { connectDB };
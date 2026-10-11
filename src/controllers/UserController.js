import { UserService } from "../services/UserService"
import { MailForwarder } from '../config/MailForwarder';
class UserController {

    constructor() {
        this.userService = new UserService();
    }

    getUsers = async (req, res) => {
        try {
            const response = await this.userService.getUsers();
            res.status(200).json({ message: "Users fetched successfully", status: "ok", data: response });
        } catch (error) {
            res.status(404).json({ message: "No users found", status: "error" });
        }
    }

    getUser = async (req, res) => {
        try {
            const response = await this.userService.getUser(req.params.id);
            return res.status(200).josn({ status: "ok", response });
        } catch (error) {
            res.status(500).json({ message: "Internal Server Error", status: "error" });
        }
    }

    updateUser = async (req, res) => {
        const userId = req.user._id
        const id = req.params.id;

        if (userId === id) {
            try {
                const data = await this.userService.updateUser(req.params.id, req.body);
                res.status(200).json({ message: "User updated successfully", status: "ok", data });
            } catch (error) {
                console.error("Error updating User:", error);
                res.status(500).json({ message: "Internal Server Error", status: "error" });
            }
        }
        return res.status(401).json({ message: "You are not authorized to edit this user" })
    }

    updateUserProfile = async (req, res) => {
        const userId = req.user._id
        const id = req.params.id;

        if (userId === id) {
            try {
                const data = await this.userService.updateUserProfile(req.params.id, req.body);
                res.status(200).json({ message: "User updated successfully", status: "ok", data });
            } catch (error) {
                console.error("Error updating User:", error);
                res.status(500).json({ message: "Internal Server Error", status: "error" });
            }
        }
        return res.status(401).json({ message: "You are not authorized to edit this user" })
    }

    deleteUser = async (req, res) => {
        const id = req.params.id;
        const userId = req.user._id;

        if (userId == id) {
            try {
                await this.userService.deleteUser(req.params.id);
                res.status(200).json({ message: "User deleted successfully", status: "ok" });
            } catch (error) {
                console.error("Error deleting User:", error);
                res.status(500).json({ message: "Internal Server Error", status: "error" });
            }
        }
        return res.status(401).json({ message: "You are not authorized to delete this user" })
    }
}

export { UserController }
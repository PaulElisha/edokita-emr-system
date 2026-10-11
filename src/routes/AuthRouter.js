import express from 'express';
import { AuthController } from '../controllers/AuthController.js';
import { Authorization } from '../middlewares/authorization.js';

class AuthRouter {
    constructor() {
        this.router = express.Router();
        this.authController = new AuthController();
        this.userAccess = new Authorization();
        this.initializeRoutes();
    }

    initializeRoutes() {
        this.router.post('/register', this.authController.registerUser);
        this.router.post('/login', this.authController.loginUser);
        this.router.post('/logout', this.userAccess.verifyToken, this.authController.logoutUser);
        this.router.post('/password/reset', this.authController.resetPassword);
        this.router.post('/password/reset/request/:token', this.authController.resetPasswordRequest);
    }
}

const authRouter = new AuthRouter().router;
export { authRouter }
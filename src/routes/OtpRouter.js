import express from 'express';
import { OtpController } from '../controllers/OtpController.js';
import { Authorization } from '../middlewares/authorization.js';


class OtpRouter {
    constructor() {
        this.router = express.Router();
        this.otpController = new OtpController();
        this.userAccess = new Authorization();
        this.initializeRoutes();
    }

    initializeRoutes() {
        this.router.post('/verify', this.otpController.verifyUserOTP);
        this.router.post('/resend', this.otpController.resendUserOTP);
    }
}

const otpRouter = new OtpRouter().router;
export { otpRouter }
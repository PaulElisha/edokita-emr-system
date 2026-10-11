import express from "express";
import { PaymentController } from "../controllers/PaymentController.js";
import { Authorization } from "../middlewares/authorization.js";

class PaymentRouter {
    constructor() {
        this.router = express.Router();
        this.paymentController = new PaymentController();
        this.userAccess = new Authorization();
        this.initializeRoutes();
    }

    initializeRoutes() {
        this.router.post('/create', this.userAccess.authorize, this.paymentController.createPayment);
    }
}

const paymentRouter = new PaymentRouter().router;
export { paymentRouter }    
import express from "express";
import { OrderController } from "../controllers/OrderController.js";
import { Authorization } from "../middlewares/authorization.js";

class OrderRouter {
    constructor() {
        this.router = express.Router();
        this.orderController = new OrderController();
        this.userAccess = new Authorization();
        this.initializeRoutes();
    }

    initializeRoutes() {
        this.router.post('/create', this.userAccess.authorize, this.orderController.placeOrder);
        this.router.get('/user', this.userAccess.authorize, this.orderController.getUserOrders);
        this.router.get('/:id', this.userAccess.authorize, this.orderController.cancelOrder);
        this.router.put('/update-status/:id', this.userAccess.authorize, this.orderController.updateOrderStatus);
    }
}

const orderRouter = new OrderRouter().router;
export { orderRouter }
import express from "express";
import { ShippingController } from "../controllers/ShippingController";
import { Authorization } from "../middlewares/authorization.js";

class ShippingRouter {
    constructor() {
        this.router = express.Router();
        this.shippingController = new ShippingController();
        this.userAccess = new Authorization();
        this.initializeRoutes();
    }

    initializeRoutes() {
        this.router.post('/create', this.userAccess.authorize, this.shippingController.createShipment);
        this.router.put('/update-status', this.userAccess.authorize, this.shippingController.updateShippingStatus);
        this.router.get('/user', this.userAccess.authorize, this.shippingController.getUserShipments);
    }
}

const shippingRouter = new ShippingRouter().router;
export { shippingRouter }   
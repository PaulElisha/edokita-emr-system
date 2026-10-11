import express from 'express';
import { CartController } from '../controllers/CartController.js';
import { Authorization } from '../middlewares/authorization.js';

class CartRouter {
    constructor() {
        this.router = express.Router();
        this.cartController = new CartController();
        this.userAccess = new Authorization();
        this.initializeRoutes();
    }

    initializeRoutes() {
        this.router.post('/create/:productId', this.userAccess.authorize, this.cartController.createCart);
        this.router.get('/user', this.userAccess.authorize, this.cartController.getUserCart);
        this.router.put('/update/:id', this.userAccess.authorize, this.cartController.editCart);
        this.router.delete('/delete/:id', this.userAccess.authorize, this.cartController.deleteCart);
    }
}

const cartRouter = new CartRouter().router;
export { cartRouter }
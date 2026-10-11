import express from 'express';
import { ProductController } from '../controllers/ProductController'
import { Authorization } from '../middlewares/authorization';

class ProductRouter {
    constructor() {
        this.router = express.Router();
        this.productController = new ProductController();
        this.userAccess = new Authorization()
        this.initializeRoutes();
    }

    initializeRoutes() {
        this.router.post('/create', this.userAccess.authorize, this.productController.registerProduct);
        this.router.get('/', this.productController.getProducts);
        this.router.get('/', this.productController.getProductsByCategory);
        this.router.get('/search', this.userAccess.authorize, this.productController.getProductByQuery);
        this.router.get('/user', this.userAccess.authorize, this.productController.getUserProducts);
        this.router.put('/update/:id', this.userAccess.authorize, this.productController.updateProduct);
        this.router.delete('/delete/:id', this.userAccess.authorize, this.productController.deleteProduct)
    }
}

const productRouter = new ProductRouter().router;
export { productRouter }
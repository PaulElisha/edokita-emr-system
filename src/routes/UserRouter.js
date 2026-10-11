import express from 'express';
import { UserController } from '../controllers/UserController.js';
import { Authorization } from '../middlewares/authorization.js';


class UserRouter {
    constructor() {
        this.router = express.Router();
        this.userController = new UserController();
        this.userAccess = new Authorization();
        this.initializeRoutes();
    }

    initializeRoutes() {
        this.router.get('/', this.userController.getUsers);
        this.router.get('/:id', this.userAccess.authorize, this.userController.getUser);
        this.router.put('/update/:id', this.userAccess.authorize, this.userController.updateUser);
        this.router.put('/profile/update/:id', this.userAccess.authorize, this.userController.updateUserProfile);
        this.router.delete('/delete/:id', this.userAccess.authorize, this.userController.deleteUser);
    }
}

const userRouter = new UserRouter().router;
export { userRouter }
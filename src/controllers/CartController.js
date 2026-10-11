import { CartService } from '../services/CartService.js';

class CartController {
    constructor() {
        this.cartService = new CartService();
    }

    createCart = async (req, res) => {
        const { userId } = req.user._id;
        const { productId } = req.params;

        const param = {
            productId,
            userId
        };

        try {
            const cart = await this.cartService.createCart(param);
            res.status(200).json({ cart });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    getUserCart = async (req, res) => {
        const userId = req.user._id;

        try {
            const cart = await this.cartService.getUserCart(userId);
            res.status(200).json({ cart })
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    editCart = async (req, res) => {
        const { actionType } = req.body;
        const productId = req.params.id;
        const userId = req.user._id;
        if (!updateData || Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: 'No cart data provided for update' });
        }

        const filter = { productId, userId };

        try {
            await this.cartService.editCart(filter, updateData);
            res.status(200).json({ message: 'Product updated successfully' });
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    }

    deleteCart = async (req, res) => {
        const cartId = req.params.id;
        const userId = req.user._id;

        const filter = {
            cartId,
            userId
        }

        try {
            await this.cartService.deleteCart(filter);
            res.status(200).json({ "Successfully deleted cart" })
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

export { CartController };
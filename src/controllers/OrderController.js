import { OrderService } from '../services/Orderservice.js';

class OrderController {

    constructor() {
        this.orderService = new OrderService();
    }

    placeOrder = async (req, res) => {
        const userId = req.user._id;

        try {
            const order = await this.orderService.placeOrder(userId);
            res.status(201).json({ order });
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    }

    getUserOrders = async (req, res) => {
        const userId = req.user._id;

        try {
            const orders = await this.orderService.getUserOrders(userId);
            res.status(200).json({ orders });
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    }

    cancelOrder = async (req, res) => {
        const orderId = req.params.id;
        const userId = req.user._id;

        const filter = {
            _id: orderId,
            userId
        };

        try {
            await this.orderService.cancelOrder(filter);
            res.status(200).json({ message: 'Order cancelled successfully' });
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    }

    updateOrderStatus = async (req, res) => {
        const orderId = req.params.id;
        const { status } = req.body;

        try {
            const updatedOrder = await this.orderService.updateOrderStatus(orderId, status);
            res.status(200).json({ updatedOrder });
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    }
}

export { OrderController }; 
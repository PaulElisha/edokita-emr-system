import { Order } from "../models/Order";
import { Cart } from "../models/Cart";

class OrderService {

    placeOrder = async (userId) => {
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            const error = new Error('No cart found for User');
            error.statusCode = 404;
            throw error;
        }

        if (cart.products.length === 0) {
            const error = new Error('User Cart is empty');
            error.statusCode = 400;
            throw error;
        }

        const order = await Order.create({
            userId,
            products: cart.products,
            totalPrice: cart.totalPrice,
            status: 'pending'
        });

        if (!order) {
            const error = new Error('Order placement failed');
            error.statusCode = 500;
            throw error;
        }

        await Cart.findOneAndDelete({ userId });

        return order;
    }

    getUserOrders = async (userId) => {
        const orders = await Order.find({ userId, status: { $ne: 'cancelled' } });
        if (orders.length === 0) {
            const error = new Error('No orders found for User');
            error.statusCode = 404;
            throw error;
        }
        return orders;
    }

    cancelOrder = async (filter) => {
        const order = await Order.findOne(filter);
        if (!order) {
            const error = new Error('Order not found');
            error.statusCode = 404;
            throw error;
        }

        if (order.status === 'cancelled') {
            const error = new Error('Order is already cancelled');
            error.statusCode = 400;
            throw error;
        }

        const cancelledOrder = await Order.updateOne(filter, {
            status: 'cancelled'
        }, { new: true });

        return cancelledOrder;
    }

    updateOrderStatus = async (orderId, status) => {
        const order = await Order.findByIdAndUpdate(
            orderId,
            { status },
            { new: true }
        );
        if (!order) throw new Error("Order not found");
        return order;
    }
}

export { OrderService };
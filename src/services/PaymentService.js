import { Payment } from "../models/Payment";
import { Order } from "../models/Order";

class PaymentService {

    async createPayment(paymentData, userId) {
        const order = await Order.findById({ orderId: paymentData.orderId });
        if (!order) throw new Error("Order not found");
        if (order.status !== "pending") throw new Error("Order not eligible for payment");

        const payment = await Payment.create(...paymentData, userId);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: payment.amount * 100,
            currency: payment.currency,
            payment_method_types: ["card"],
            metadata: { userId, orderId: payment.orderId, paymentId: payment._id.toString() },
        });

        return {
            clientSecret: paymentIntent.client_secret
        };
    }

    async confirmPayment(paymentId, transactionId, success) {
        const payment = await Payment.findById(paymentId);
        if (!payment) throw new Error("Payment not found");

        payment.transactionId = transactionId;
        payment.status = success ? "success" : "failed";
        payment.attempts += 1;
        await payment.save();

        if (success) {
            await Order.findByIdAndUpdate(payment.orderId, { status: "paid" });
        }

        return payment;
    }

    async handleStripeWebhook(event) {
        const data = event.data.object;

        if (event.type === "payment_intent.succeeded") {
            const { metadata, id } = data;
            await this.confirmPayment(metadata.paymentId, id, true);
        }

        if (event.type === "payment_intent.payment_failed") {
            const { metadata, id } = data;
            await this.confirmPayment(metadata.paymentId, id, false);
        }
    }
}

export { PaymentService };
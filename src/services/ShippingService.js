import { Shipping } from "../models/Shipping.js";
import { Order } from "../models/Order.js";

class ShippingService {
    createShipment = async (orderId, userId, carrier, trackingNumber, eta) => {
        const shipping = await Shipping.create({
            orderId,
            userId,
            carrier,
            trackingNumber,
            status: "pending",
            estimatedDelivery: eta
        });

        if (!shipping) throw new Error("Failed to create shipment");
        await Order.findByIdAndUpdate(orderId, { status: "shipped" });

        return shipping;
    }

    updateShippingStatus = async (trackingNumber, status) => {
        const shipping = await Shipping.findOneAndUpdate(
            { trackingNumber },
            { status },
            { new: true }
        );
        if (!shipping) throw new Error("Shipment not found");
        return shipping;
    }

    getUserShipments = async (userId) => {
        return await Shipping.find({ userId });
    }
}

export { ShippingService };
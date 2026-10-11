import { ShippingService } from "../services/ShippingService.js";

class ShippingController {
    constructor() {
        this.shippingService = new ShippingService();
    }

    createShipment = async (req, res) => {
        try {
            const { orderId, carrier, trackingNumber, eta } = req.body;
            const userId = req.user._id;
            const shipping = await this.shippingService.createShipment(orderId, userId, carrier, trackingNumber, eta);
            res.status(201).json({ message: "Shipment created", shipping });
        } catch (error) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    updateShippingStatus = async (req, res) => {
        try {
            const { trackingNumber, status } = req.body;
            const updated = await this.shippingService.updateShippingStatus(trackingNumber, status);
            res.status(200).json({ message: "Shipping status updated", shipping: updated });
        } catch (error) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }

    getUserShipments = async (req, res) => {
        try {
            const shipments = await this.shippingService.getUserShipments(req.user._id);
            res.status(200).json({ message: "Shipments fetched", shipments });
        } catch (error) {
            res.status(error.statusCode || 500).json({ message: error.message });
        }
    }
}

export { ShippingController };

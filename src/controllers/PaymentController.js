import { PaymentService } from "../services/PaymentService";

class PaymentController {

    constructor() {
        this.paymentService = new PaymentService();
    }

    createPayment = async (req, res) => {
        const userId = req.user._id;

        try {
            const payment = await this.paymentService.createPayment(req.body, userId);
            res.status(200).json({ payment });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

export { PaymentController };
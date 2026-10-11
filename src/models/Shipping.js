import { Schema } from "mongoose";

const shippingSchema = new Schema({
    orderId: {
        type: Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    address: {
        type: String,
        required: true
    },
    city: {
        type: String,
        required: true
    },
    postalCode: {
        type: String,
        required: true
    },
    country: {
        type: String,
        required: true
    },
    provider: {
        type: String,
        enum: ['fedex', 'ups', 'dhl', 'usps'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'shipped', 'in_transit', 'delivered', 'returned'],
        default: 'pending'
    },
    trackingNumber: {
        type: String
    },
    estimatedDelivery: {
        type: Date
    },
    shippedAt: {
        type: Date
    },
    deliveredAt: {
        type: Date
    }
}, {
    timestamps: true
});

const Shipping = model("Shipping", shippingSchema);
export { Shipping };

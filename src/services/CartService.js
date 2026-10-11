import { Cart } from '../models/cartModel.js';
import { Product } from '../models/productModel.js';

class CartService {
    createCart = async (param) => {
        const { productId, userId } = param;

        const product = await Product.findById(productId);
        if (!product) {
            const error = new Error('The product does not exist');
            error.statusCode = 404;
            throw error;
        }

        let cart = await Cart.findOne({ userId });
        if (cart) {
            const productIndex = cart.products.findIndex(p => p.productId.toString() === productId);
            productIndex !== -1 ?
                (
                    cart.products[productIndex].quantity += 1,
                    cart.products[productIndex].totalItemPrice = cart.products[productIndex].quantity * product.price
                ) : cart.products.push({
                    productId, quantity: 1, price, totalItemPrice: product.price
                });


            cart.totalPrice = cart.products.reduce((sum, p) => sum + p.totalItemPrice, 0)

            await cart.save();
            return { cart, message: "Cart successfully updated" };
        }

        cart = await Cart.create({
            userId: user._id,
            products: [{ productId, quantity: 1, price: product.price, totalItemPrice: product.price }],
            totalPrice: product.price
        });

        if (!cart) {
            const error = new Error('Server error, cart creation failed');
            error.statusCode = 500;
            throw error;
        }

        return cart;
    }

    getUserCart = async (param) => {
        const { userId } = param;

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            const error = new Error('No cart found for User');
            error.statusCode = 404;
            throw error;
        }

        return cart;
    }

    editCart = async (filter, updateData) => {
        const { actionType } = updateData;
        const { productId, userId } = filter;
        const product = await Product.findOne({ productId: productId });
        if (!product) {
            const error = new Error('Product not found');
            error.statusCode = 404;
            throw error;
        }

        const cart = await Cart.findOne({ userId: userId });
        if (!cart) {
            const error = new Error('No cart found for User');
            error.statusCode = 404;
            throw error;
        }

        const productIndex = cart.products.findIndex(p => p.productId.toString() === productId);

        if (productIndex !== -1) {
            switch (actionType) {
                case actionType === "increment":
                    cart.products[productIndex].quantity += 1;
                    cart.products[productIndex].totalItemPrice = cart.products[productIndex].quantity * cart.products[productIndex].price;
                    break;

                case actionType === "decrement":
                    cart.products[productIndex].quantity -= 1;

                    if (cart.products[productIndex].quantity <= 0) {
                        cart.products.filter(product => product.productId === productIndex);

                        if (cart.products.length === 0) {
                            await Cart.findOneAndDelete({ userId: userId });
                            return { message: 'Cart is empty, deleted successfully' };
                        }

                        cart.totalPrice = cart.products.reduce((sum, p) => sum + p.totalItemPrice, 0);
                        await cart.save();
                        return { message: 'Product removed from cart successfully' };
                    } else {
                        cart.products[productIndex].totalItemPrice = cart.products[productIndex].quantity * product.price;
                    }
                    break;

                default:
                    return { message: 'Invalid action type' };
            }
            cart.totalPrice = cart.products.reduce((sum, p) => sum + p.totalItemPrice, 0);
            cart.populate('products.productId');
            await cart.save();
        }
    }

    deleteCart = async (filter) => {
        const { cartId, userId } = filter;

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            const error = new Error('No cart found for User');
            error.statusCode = 404;
            throw error;
        }

        await Cart.findOneAndDelete(filter);
        if (!deletedProduct) {
            const error = new Error('Product deletion failed');
            error.statusCode = 500;
            throw error;
        }
    }
}

export { CartService };
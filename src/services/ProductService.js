import { Product } from '../models/productModel.js';

class ProductService {

    registerProduct = async (productData) => {
        const foundProduct = await Product.findOne({ name: productData.name });
        if (foundProduct) {
            const error = new Error('Product with this name already exists');
            error.statusCode = 400;
            throw error;
        }
        const product = Product.create(productData);
        if (!product) {
            const error = new Error('Product creation failed');
            error.statusCode = 500;
            throw error;
        }
    }

    getProductsByCategory = async (category) => {
        const products = await Product.find({ category });
        if (products.length === 0) {
            const error = new Error('No products found in this category');
            error.statusCode = 404;
            throw error;
        }
        return products;
    }

    getProducts = async () => {
        const products = await Product.find().populate('userId');
        if (products.length === 0) {
            const error = new Error('No products found');
            error.statusCode = 404;
            throw error;
        }
        return products;
    }

    getProductByParam = async (query) => {
        const product = await Product.find(query);
        if (product.length === 0) {
            const error = new Error('No products found');
            error.statusCode = 404;
            throw error;
        }
        return product;
    }

    getUserProducts = async (user) => {
        const products = await Product.findOne({ userId: user._id });
        if (!products || products.length === 0) {
            const error = new Error('No products found for this user');
            error.statusCode = 404;
            throw error;
        }
        return products;
    }

    updateProduct = async (filter, productUpdate) => {
        const product = await Product.findOne(filter);
        if (!product) {
            const error = new Error('Product not found');
            error.statusCode = 404;
            throw error;
        }

        const updatedProduct = await Product.findOneAndUpdate(filter, {
            $set: {
                'name': productUpdate.name,
                'price': productUpdate.price,
                'color': productUpdate.color,
                'size': productUpdate.size
            }
        }, { new: true });

        if (!updatedProduct) {
            const error = new Error('Product update failed');
            error.statusCode = 500;
            throw error;
        }

        return updatedProduct;
    }

    deleteProduct = async (filter) => {
        const product = await Product.findOne(filter);
        if (!product) {
            const error = new Error('Product not found');
            error.statusCode = 404;
            throw error;
        }
        await Product.findOneAndDelete(filter);
        if (!deletedProduct) {
            const error = new Error('Product deletion failed');
            error.statusCode = 500;
            throw error;
        }
    }
}

export { ProductService };
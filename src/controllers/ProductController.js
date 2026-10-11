import { ProductService } from '../services/ProductService.js';

class ProductController {

    constructor() {
        this.productService = new ProductService();
    }

    registerProduct = async (req, res) => {
        const userId = req.user._id
        try {
            await this.productService.registerProduct({ ...req.body, userId });
            res.status(201).json({ message: 'Product created successfully' });
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    }

    getProducts = async (req, res) => {
        try {
            const products = await this.productService.getProducts();
            res.status(200).json(products);
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    }

    getProductsByCategory = async (req, res) => {
        const { category } = req.params;
        try {
            const products = await this.productService.getProductsByCategory(category);
            res.status(200).json(products);
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    }

    getProductByQuery = async (req, res) => {
        const query = {};
        const { name, price, year } = req.query;
        if (name) query.name = name;
        if (price) query.price = price;
        if (year) query.year = year;

        try {
            const product = await this.productService.getProductByParam(query);
            res.status(200).json(product);
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    }

    getUserProducts = async (req, res) => {
        try {
            const products = await this.productService.getUserProducts(req.user);
            res.status(200).json(products);
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    }

    updateProduct = async (req, res) => {
        const updateData = req.body;
        const productId = req.params.id;
        const userId = req.user._id;
        if (!updateData || Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: 'No product data provided for update' });
        }

        const filter = { _id: productId, userId };

        try {
            const data = await this.productService.updateProduct(filter, updateData);
            res.status(200).json({ message: 'Product updated successfully', status: 'ok', data });
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    }

    deleteProduct = async (req, res) => {
        const productId = req.params.id;
        const user = req.user;

        try {
            await this.productService.deleteProduct({ _id: productId, userId: user._id });
            res.status(200).json({ message: 'Product deleted successfully' });
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    }
}

export { ProductController };
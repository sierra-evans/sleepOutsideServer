import { Router } from "express";
import EntityNotFoundError from "../errors/EntityNotFoundError.mts";
import { sanitize } from "../services/utils.mts";
import authorize from "../middleware/authorize.mts";
import productService from "../services/product.service.mts";

const router: Router = Router();

// Restriced to one specifc credit card number for right now.
const TEST_CARD = "123456789012";

// Same limit the cart page enforces.
const MAX_QUANTITY = 99;

const badRequest = (message: string) =>
    new EntityNotFoundError({ message, code: "ERR_VALID", statusCode: 400 });

// POST /orders/
router.post("/", authorize, async (req, res, next) => {
    try {
        const { orderItems, totalPrice, cardNumber, cardExpiration, cardCode } =
            sanitize(req.body);

        if (!Array.isArray(orderItems) || orderItems.length === 0) {
            return next(badRequest("orderItems must contain at least one item"));
        }

        // Validate totals against the real product prices.
        let serverTotal = 0;
        for (const item of orderItems) {
            // quantity is optional for backwards compatibility: an item without one counts as 1
            const quantity = item.quantity ?? 1;
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
                return next(badRequest(`quantity for ${item.productId} must be a whole number from 1 to ${MAX_QUANTITY}`));
            }
            const product = await productService.getProductById(item.productId);
            if (!product) return next(badRequest(`Product ${item.productId} not found`));
            serverTotal += product.finalPrice * quantity;
        }
        if (Math.round(serverTotal * 100) !== Math.round(totalPrice * 100)) {
            return next(badRequest("totalPrice does not match the items in the cart"));
        }

        // Validate payment.
        if (cardNumber !== TEST_CARD) {
            return next(badRequest("Invalid card number"));
        }
        if (!/^\d{3}$/.test(cardCode)) {
            return next(badRequest("cardCode must be 3 digits"));
        }
        const match = /^(\d{2})\/(\d{2})$/.exec(cardExpiration);
        if (!match) return next(badRequest("cardExpiration must be mm/yy"));
        const month = Number(match[1]);
        const year = 2000 + Number(match[2]);
        if (month < 1 || month > 12 || new Date(year, month, 1) <= new Date()) {
            return next(badRequest("Card is expired or the date is invalid"));
        }

        // TODO: save the order to the database.
        res.status(201).json({ order: { ...req.body, userId: res.locals.user._id } });
    } catch (err) {
        next(err);
    }
});

export default router;
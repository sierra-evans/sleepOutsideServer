import {Router } from "express";
import productService from "../services/product.service.mts";
import EntityNotFoundError from "../errors/EntityNotFoundError.mts";
const router: Router = Router();

// GET /products/
router.get("/", async (req, res, next) => {
  // console.log(req.headers, req.body);
  try {
  const products = await productService.getAllProducts();
  if (!products?.length) {
    // This is an example you can refer to about how to handle errors in our routes
    // If you check the middleware folder you will see a general error handler that will get called automatically when we throw like this
    return next(new EntityNotFoundError({message : 'Products Not Found',code: 'ERR_NF',
    statusCode : 404}))
  }

  res.status(200).json(products);
} catch (error) {
  next(error);
}
});

router.get("/:id", async (req, res, next) => {
  
  const {id} = req.params;
  if (!id)  {
    return next(new EntityNotFoundError({message : 'Id required',code: 'ERR_VALID', statusCode : 400}))
  }
  const product = await productService.getProductById(id);
  if (!product) {
    return next(new EntityNotFoundError({message : `Product ${id} Not Found`,code: 'ERR_NF',
      statusCode : 404}))
  }
  res.status(200).json(product);

});

export default router; // Export the router to use it in the main file

import productModel from "../models/product.model.mts";
import type { Product, QueryParams, FindProductObj } from "../models/types.mts";
import { buildPaginationWrapper, formatFields } from './utils.mts'

type Category = Product['category'];

const getAllProducts = async (query: QueryParams) => {
  let find: FindProductObj = {
    search: {},
    limit: query.limit ? parseInt(query.limit) : 20,
    offset: query.offset ? parseInt(query.offset) : 0
  }
  const { q, category, fields } = query;

  find.fieldFilters = fields ? formatFields(fields) : undefined;
  if (category) {
    find.search.category = category as Category;
  }
  if (q) {
    find.search.name = q;
    find.search.descriptionHtmlSimple = q;
  }
  // now that we know what we have send it to the model and get the results.
  const data = await productModel.getAllProducts(find);
  // take the results and format them correctly
  const wrapper = buildPaginationWrapper(data.totalCount, query)
  // don't forget to actually set the records in there.
  wrapper.results = data.results
  return wrapper
};

const getProductById = async (id: string) => {
  return await productModel.getProductById(id);
};

// PRODUCT SEARCH ENDPOINT
const searchProducts = async (q: string) => {
  return await productModel.searchProducts(q);
};

// RECOMMENDED PRODUCTS
const RECOMMENDATION_COUNT = 3;

// Returns 3 products to recommend alongside the product with the given id, or null if that product doesn't exist.
//   1. another product from the SAME category (random)
//   2. a product from a DIFFERENT category (random)
//   3. the product closest in price, from any category
// The product being viewed is never included, and no product is recommended twice: each step
// excludes the viewed product plus everything already picked. If step 1 or 2 finds nothing
// (e.g. a category with only one product), step 3 fills the gap so we still return 3 when we can.
const getRecommendedProducts = async (id: string): Promise<Product[] | null> => {
  const product = await productModel.getProductById(id);
  if (!product) return null;

  const recommended: Product[] = [];
  // ids we must not return: the current product and anything already recommended
  const notAlreadyUsed = () => ({ $nin: [product.id, ...recommended.map((p) => p.id)] });

  const [sameCategory] = await productModel.getRandomProducts(
    { category: product.category, id: notAlreadyUsed() },
    1
  );
  if (sameCategory) recommended.push(sameCategory);

  const [differentCategory] = await productModel.getRandomProducts(
    { category: { $ne: product.category }, id: notAlreadyUsed() },
    1
  );
  if (differentCategory) recommended.push(differentCategory);

  const similarPrice = await productModel.getProductsClosestInPrice(
    { id: notAlreadyUsed() },
    product.finalPrice,
    RECOMMENDATION_COUNT - recommended.length
  );
  recommended.push(...similarPrice);

  return recommended;
};

export default {
  getAllProducts,
  getProductById,
  searchProducts,
  getRecommendedProducts
};
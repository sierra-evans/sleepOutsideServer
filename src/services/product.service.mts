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

export default {
  getAllProducts,
  getProductById
};
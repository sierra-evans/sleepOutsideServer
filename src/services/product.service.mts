import productModel from "../models/product.model.mts";
import type {Product, QueryParams, FindProductObj} from "../models/types.mts";
import {buildPaginationWrapper, formatFields, escapeRegex} from './utils.mts'
import EntityNotFoundError from "../errors/EntityNotFoundError.mts";

const categories: Product["category"][] = ["tents", "backpacks", "sleeping-bags", "hammocks"];

// type guard: lets typescript know the string is one of our product categories
const isCategory = (value: string): value is Product["category"] =>
  categories.includes(value as Product["category"]);

 const getAllProducts = async (query:QueryParams) => {
  const limit = query.limit? parseInt(query.limit) : 20;
  const offset = query.offset? parseInt(query.offset) : 0;
  if (isNaN(limit) || limit < 1 || isNaN(offset) || offset < 0) {
    throw new EntityNotFoundError({message: 'limit must be a positive number and offset cannot be negative', code: 'ERR_VALID', statusCode: 400});
  }
  let find:FindProductObj = {search: {}, limit, offset};
  const {q, category, fields} = query;

  find.fieldFilters = fields? formatFields(fields): undefined;
  if(category) {
      if (!isCategory(category)) {
        throw new EntityNotFoundError({message: `category must be one of: ${categories.join(", ")}`, code: 'ERR_VALID', statusCode: 400});
      }
      find.search.category = category;
  }
  if(q) {
      // match the search terms anywhere in the name OR the description (case insensitive)
      const regex = new RegExp(escapeRegex(q), "i");
      find.search.$or = [{name: regex}, {descriptionHtmlSimple: regex}];
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
import mongodb from "../database/index.mts";
import type { Product, FindProductObj } from "./types.mts";
import type { Collection, Filter } from "mongodb";

export async function getAllProducts(find: FindProductObj) {
  // get a reference to our Products collection
  const productsCollection: Collection<Product> = mongodb.getDb().collection<Product>('products');
  // get the total number of records matching our query
  const totalCount = await productsCollection.countDocuments(find.search);
  // apply the filters to get the matching records
  const cursor = await productsCollection.find(find.search).skip(find.offset).limit(find.limit);
  // if fields were specified then reduce the results to just the required fields
  if (find.fieldFilters) {
    cursor.project(find.fieldFilters);
  }
  // finally convert the result to an array that we can consume
  const results = await cursor.toArray();
  return { results, totalCount };
}

async function getProductById(id: string): Promise<Product | null> {
  const product = await mongodb.getDb().collection<Product>("products").findOne({ id: id });
  return product;
}

// PRODUCT SEARCH ENDPOINT
async function searchProducts(q: string) {
  const productsCollection: Collection<Product> = mongodb.getDb().collection<Product>("products");

  // Escape special characters so that input does not break the regex.
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "i"); 

  const results = await productsCollection
    .find({
      $or: [
        { category: regex },
        { name: regex },
        { description: regex },
        { descriptionHtmlSimple: regex },
      ],
    })
    .toArray();

  return { count: results.length, results };
}

// RECOMMENDED PRODUCTS HELPERS

// Returns up to `count` random products matching the filter.
// $sample picks randomly so shoppers see some variety each time they view a product.
async function getRandomProducts(filter: Filter<Product>, count: number): Promise<Product[]> {
  if (count <= 0) return [];
  return mongodb.getDb().collection<Product>("products")
    .aggregate<Product>([
      { $match: filter },
      { $sample: { size: count } }
    ])
    .toArray();
}

// Returns up to `count` products matching the filter whose finalPrice is closest to `price`.
async function getProductsClosestInPrice(filter: Filter<Product>, price: number, count: number): Promise<Product[]> {
  if (count <= 0) return [];
  return mongodb.getDb().collection<Product>("products")
    .aggregate<Product>([
      { $match: filter },
      // work out how far each product's price is from the target, in either direction
      { $addFields: { priceDifference: { $abs: { $subtract: ["$finalPrice", price] } } } },
      // closest first. Sorting by id as well keeps ties in a stable order.
      { $sort: { priceDifference: 1, id: 1 } },
      { $limit: count },
      // the helper field was only for sorting, don't send it to the client
      { $project: { priceDifference: 0 } }
    ])
    .toArray();
}

export default {
  getAllProducts,
  getProductById,
  searchProducts,
  getRandomProducts,
  getProductsClosestInPrice
};
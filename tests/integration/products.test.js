// Load environment variables for tests
import "dotenv/config";

// Import test helpers from vitest
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Mock the database module so tests don't require a live MongoDB instance.
// The mock implements the minimal API used by the model: `initDb`, `getDb`, and `closeDb`.
vi.mock("../../src/database/index.mts", () => {
  // in-memory store for collections
  const collections = {
    products: [
      {
        id: "880RR",
        nameWithoutBrand: "Ajax Tent - 3-Person, 3-Season",
        name: "Marmot Ajax Tent - 3-Person, 3-Season",
        image:
          "../images/tents/marmot-ajax-tent-3-person-3-season-in-pale-pumpkin-terracotta~p~880rr_01~320.jpg",

        sizesAvailable: {},
        colors: [
          {
            colorCode: "01",
            colorName: "Pale Pumpkin/Terracotta"
          }
        ],
        descriptionHtmlSimple:
          "Get out and enjoy nature with Marmot&#39;s Ajax tent, featuring a smart design with durable, waterproof construction and two doors for easy access.",
        suggestedRetailPrice: 300.0,
        brand: {
          id: "1308",
          logoSrc: "../images/logos/marmot-160x100.jpg",
          name: "Marmot"
        },
        listPrice: 199.99,
        finalPrice: 199.99
      }
    ]
  };

  return {
    default: {
      initDb: (cb) => cb && cb(null),
      getDb: () => ({
        collection: (name) => ({
          countDocuments: async (query) => (collections[name] || []).length,
          // a tiny cursor: skip/limit/project return the cursor so they can be chained like the real thing
          find: (query) => {
            let docs = collections[name] || [];
            const cursor = {
              skip: (n) => { docs = docs.slice(n); return cursor; },
              limit: (n) => { docs = docs.slice(0, n); return cursor; },
              project: () => cursor,
              toArray: async () => docs
            };
            return cursor;
          },
          deleteMany: async (q) => {
            collections[name] = [];
            return { deletedCount: 0 };
          }
        })
      }),
      closeDb: async () => {
        // noop for mock
      }
    }
  };
});

describe("getAllProducts", () => {
  // the same shape product.service builds from the query string (no filter, first page of 20)
  const defaultFind = { search: {}, limit: 20, offset: 0 };
  let mongodb;
  let productsModel;

  beforeAll(async () => {
    // Import the mocked DB module and the model after the mock is registered
    mongodb = (await import("../../src/database/index.mts")).default;
    productsModel = (await import("../../src/models/product.model.mts"))
      .default;

    // call initDb (mocked)
    await new Promise((resolve, reject) => {
      mongodb.initDb((err) => (err ? reject(err) : resolve(null)));
    });
  });

  afterAll(async () => {
    try {
      await mongodb.closeDb();
    } catch (e) {
      // ignore
    }
  });

  it("should return an array of products", async () => {
    const data = await productsModel.getAllProducts(defaultFind);

    expect(data.totalCount).toBe(1);
    expect(data.results).toEqual([
      {
        id: "880RR",
        nameWithoutBrand: "Ajax Tent - 3-Person, 3-Season",
        name: "Marmot Ajax Tent - 3-Person, 3-Season",
        image:
          "../images/tents/marmot-ajax-tent-3-person-3-season-in-pale-pumpkin-terracotta~p~880rr_01~320.jpg",

        sizesAvailable: {},
        colors: [
          {
            colorCode: "01",
            colorName: "Pale Pumpkin/Terracotta"
          }
        ],
        descriptionHtmlSimple:
          "Get out and enjoy nature with Marmot&#39;s Ajax tent, featuring a smart design with durable, waterproof construction and two doors for easy access.",
        suggestedRetailPrice: 300.0,
        brand: {
          id: "1308",
          logoSrc: "../images/logos/marmot-160x100.jpg",
          name: "Marmot"
        },
        listPrice: 199.99,
        finalPrice: 199.99
      }
    ]);
    // toBeInstanceOf(Array);
  });

  it("should return an empty list if no documents are found in the database", async () => {
    // clear out any existing test data via mocked collection
    const collection = (await import("../../src/database/index.mts")).default
      .getDb()
      .collection("products");
    await collection.deleteMany({});

    const data = await productsModel.getAllProducts(defaultFind);
    expect(data).toEqual({ results: [], totalCount: 0 });
  });
});

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { products as seedProducts } from "../../src/database/products.js";

// The real seed data, reduced to the fields recommendations care about (the DB stores them camelCased).
const catalog = seedProducts.map((p) => ({
  id: p.Id,
  category: p.Category,
  finalPrice: p.FinalPrice,
  name: p.Name
}));
let products = catalog;

// Tiny stand-in for the Mongo filters the service builds: equality, $ne and $nin.
function matches(product, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (condition && typeof condition === "object") {
      if ("$nin" in condition && condition.$nin.includes(product[key])) return false;
      if ("$ne" in condition && product[key] === condition.$ne) return false;
      return true;
    }
    return product[key] === condition;
  });
}

// Mock the model so the tests don't need a live MongoDB. The fakes behave like the real
// aggregation pipelines: random sample, and closest-in-price sorted with id as a tie breaker.
vi.mock("../../src/models/product.model.mts", () => ({
  default: {
    getProductById: vi.fn(async (id) => products.find((p) => p.id === id) || null),
    getRandomProducts: vi.fn(async (filter, count) =>
      products
        .filter((p) => matches(p, filter))
        .sort(() => Math.random() - 0.5)
        .slice(0, count)
    ),
    getProductsClosestInPrice: vi.fn(async (filter, price, count) =>
      products
        .filter((p) => matches(p, filter))
        .sort((a, b) =>
          Math.abs(a.finalPrice - price) - Math.abs(b.finalPrice - price) || a.id.localeCompare(b.id)
        )
        .slice(0, count)
    )
  }
}));

let productService;

beforeAll(async () => {
  productService = (await import("../../src/services/product.service.mts")).default;
});

beforeEach(() => {
  products = catalog;
});

describe("productService.getRecommendedProducts", () => {
  it("returns null for a product that doesn't exist", async () => {
    expect(await productService.getRecommendedProducts("NOPE")).toBeNull();
  });

  it("returns 3 products: same category, different category, closest price", async () => {
    const viewed = catalog.find((p) => p.id === "880RR");
    const results = await productService.getRecommendedProducts("880RR");

    expect(results).toHaveLength(3);
    const [same, different, closest] = results;
    expect(same.category).toBe(viewed.category);
    expect(different.category).not.toBe(viewed.category);

    // the third pick is the closest-priced product that wasn't already used
    const used = [viewed.id, same.id, different.id];
    const expectedClosest = catalog
      .filter((p) => !used.includes(p.id))
      .sort((a, b) =>
        Math.abs(a.finalPrice - viewed.finalPrice) - Math.abs(b.finalPrice - viewed.finalPrice) ||
        a.id.localeCompare(b.id)
      )[0];
    expect(closest.id).toBe(expectedClosest.id);
  });

  it("never includes the viewed product and never repeats a product", async () => {
    // picks are random, so check every product many times over
    for (let run = 0; run < 200; run++) {
      const viewed = catalog[run % catalog.length];
      const results = await productService.getRecommendedProducts(viewed.id);
      const ids = results.map((p) => p.id);

      expect(results).toHaveLength(3);
      expect(ids).not.toContain(viewed.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("still returns 3 when the product is the only one in its category", async () => {
    products = [
      { id: "LONELY", category: "hammocks", finalPrice: 50, name: "Only hammock" },
      ...catalog.filter((p) => p.category !== "hammocks")
    ];
    const results = await productService.getRecommendedProducts("LONELY");
    const ids = results.map((p) => p.id);

    expect(results).toHaveLength(3);
    expect(ids).not.toContain("LONELY");
    expect(new Set(ids).size).toBe(3);
  });

  it("returns fewer than 3 rather than duplicates when the catalog is tiny", async () => {
    products = [
      { id: "A", category: "tents", finalPrice: 100, name: "A" },
      { id: "B", category: "tents", finalPrice: 120, name: "B" }
    ];
    const results = await productService.getRecommendedProducts("A");
    expect(results.map((p) => p.id)).toEqual(["B"]);
  });
});

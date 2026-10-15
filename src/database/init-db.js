// import MongoClient and ServerApiVersion from the mongodb library and import products from the products.js file.
import { MongoClient, ServerApiVersion } from "mongodb";
import { products } from "./products.js";
import * as argon2 from "argon2";

//build the uri for our connection string
const uri = process.env.MONGO_URI || "";
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
});
const init = async () => {
  try {
    await client.connect();
    console.log(`Connected to MongoDB`);
    // get a reference to the actual database we will be using with .db(<database name>)
    const db = client.db(process.env.MONGO_DATABASE);

    // drop and re-create the alerts and orders collections (they start out empty)
    await db.collection("alerts").drop();
    await db.collection("orders").drop();
    await db.createCollection("alerts");
    await db.createCollection("orders");
    console.log("Collections 'alerts' and 'orders' created successfully");

    // initialize the Users collection
    await seedUsers(db);

    // initialize the Products collection
    await seedProducts(db);
  } catch (error) {
    console.error(error.message);
  } finally {
    await client.close();
  }
};
const lowerCaseKeys = function (obj) {
  // if it is an object, but NOT an array, then we need to iterate through all of its keys
  if (typeof obj === "object" && !Array.isArray(obj)) {
    for (let key in obj) {
      // take the first letter (key[0]) of the key and make it lowercase
      // then add that to the rest of the key after REMOVING the first letter (key.slice(1))
      let newKey = key[0].toLowerCase() + key.slice(1);
      // if the value of this key is an object, then we need to call this function again
      if (typeof obj[key] === "object") {
        obj[newKey] = lowerCaseKeys(obj[key]);
        delete obj[key];
      } else {
        obj[newKey] = obj[key];
        delete obj[key];
      }
    }
  } else if (Array.isArray(obj)) {
    // if it is an array, then we need to iterate through each item in the array
    // and for each object value call the function again.
    for (let i = 0; i < obj.length; i++) {
      let item = obj[i];
      if (typeof item === "object") {
        obj[i] = lowerCaseKeys(item);
      }
    }
  }
  return obj;
};
const seedProducts = async (db) => {
  // we need to make a small transform to the provided data before inserting
  // use .map() to transform each product before inserting it into the database
  // change Reviews.ReviewUrl to match the following pattern: /products/<productId>/reviews/
  // while we are at it...the data provided used a PascalCase naming convention for its keys. Use the provided lowerCaseKeys function to convert all keys to camelCase. This will make it consistent with the rest of our models.
  const newProducts = products.map((product) => {
    product.Reviews.ReviewsUrl = `/products/${product.Id}/reviews/`;
    product = lowerCaseKeys(product);
    return product;
  });
  try {
    // drop the collection to clear out the old records
    await db.collection("products").drop();
    console.log("Collection 'products' dropped successfully");
    // create a new collection
    await db.createCollection("products");
    console.log("Collection 'products' created successfully");
    // insert all products
    const result = await db.collection("products").insertMany(newProducts);
    console.log(
      `${result.insertedCount} new listing(s) created with the following id(s):`
    );
    console.log(result.insertedIds);
    await db.collection("products").createIndex({ id: 1 });
    await db.collection("products").createIndex({ name: 1 });
    await db.collection("products").createIndex({ category: 1 });
    await db.collection("products").createIndex({ descriptionHtmlSimple: 1 });
  } catch (error) {
    console.error(error.message);
  }
};

const seedUsers = async (db) => {
  // drop and recreate the users collection
  await db.collection("users").drop();
  await db.createCollection("users");
  console.log("Collection 'users' created successfully");
  // add indexes on email and name fields. email must be unique so two users can't share one
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("users").createIndex({ name: 1 });

  // add a new user to the database
  const user = {
    email: "test@test.com",
    password: await argon2.hash("password"),
    name: "Test User",
    createdAt: new Date(),
    modifiedAt: new Date()
  };
  try {
    // insert the user
    const result = await db.collection("users").insertOne(user);
    console.log(`New user created with the following id: ${result.insertedId}`);
  } catch (error) {
    console.error(error.message);
  }
};

init();
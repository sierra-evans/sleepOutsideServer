import { ObjectId } from "mongodb";
import mongodb from "../database/index.mts";
import type { User } from "./types.mts";

async function getUserByEmail(email: string) {
    const user = await mongodb.getDb().collection<User>("users").findOne({ email: email });
    return user;
}

async function getUserById(id: string) {
    // ObjectId will throw if handed a malformed id, so check first and treat it as "not found"
    if (!ObjectId.isValid(id)) return null;
    const user = await mongodb.getDb().collection<User>("users").findOne({ _id: new ObjectId(id) });
    return user;
}

async function createUser(newUser: { email: string, password: string, name: string }) {
    const result = await mongodb.getDb().collection("users").insertOne(newUser)
    return result
}

// Saves the new hash and bumps tokenVersion so every token issued before this moment stops working.
// Returns the updated user (or null if the user disappeared).
async function updatePassword(id: string, passwordHash: string) {
    const updated = await mongodb.getDb().collection<User>("users").findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
            $set: { password: passwordHash, modifiedAt: new Date() },
            $inc: { tokenVersion: 1 }
        },
        { returnDocument: "after" }
    );
    return updated;
}

export default {
    getUserByEmail,
    getUserById,
    createUser,
    updatePassword
}

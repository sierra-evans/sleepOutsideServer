import userModel from "../models/user.model.mts";
import type { User, PublicUser } from "../models/types.mts";
import * as argon2 from "argon2";
import { generateToken, validator } from "./utils.mts"
import Ajv from "ajv";
import addFormats from "ajv-formats"
import addKeywords from "ajv-keywords"
import { UserSchema, ChangePasswordSchema } from "../database/json-schema.ts";
import EntityNotFoundError from "../errors/EntityNotFoundError.mts";

// for some reason typescript doesn't like this even though it is exactly how the documentation says to use these. We are just going to ignore the types for now
// @ts-ignore
// const ajv = new Ajv();
// // @ts-ignore
// addFormats(ajv);
// // @ts-ignore
// addKeywords(ajv, "instanceof");

// Only these fields ever leave the server. The full user document contains the password hash.
function toPublicUser(user: User): PublicUser {
    return { _id: String(user._id), email: user.email, name: user.name };
}

async function login(email: string, password: string) {
    // Check if the user exists in the database. the user will be providing an email as identifier...so we will need a function in the model to retrieve a user by email
    const user = await userModel.getUserByEmail(email);

    // check to see if a user was found, ANd that the password provided matches the one returned from the database. Remember that the password in the database is hashed and salted...so we need to use argon2 to verify it "argon2.verify(passwordHash, password)"
    if (user && await argon2.verify(user.password, password)) {
        // If the user exists and password matches...then generate a token using jsonwebtoken
        const token = await generateToken(user);
        return { user: toPublicUser(user), token };
    }

    // Either the user doesn't exist or the password was wrong. Don't say which, and don't return any user data.
    return { user: null, token: null };
};

async function register(email: string, password: string, name: string) {
    const newUser = {
        email,
        password,
        name,
        tokenVersion: 0,
        createdAt: new Date(),
        modifiedAt: new Date()
    }
    // Validate BEFORE hashing. The hash is always ~97 characters, so validating it would never
    // catch a password that is too short (or too long).
    validator(UserSchema, newUser);

    const user = await userModel.getUserByEmail(email);
    if (user) throw new EntityNotFoundError({ message: "User already exists", statusCode: 409 });

    newUser.password = await argon2.hash(password);
    return userModel.createUser(newUser)
}

async function changePassword(userId: string, currentPassword: string, newPassword: string) {
    // validate the raw input first (types, required fields, length of the new password)
    validator(ChangePasswordSchema, { currentPassword, newPassword });

    if (currentPassword === newPassword) {
        throw new EntityNotFoundError({
            message: "New password must be different from the current password",
            code: "ERR_VALID",
            statusCode: 400
        });
    }

    // the id comes from the verified JWT, so the user can only ever change their own password
    const user = await userModel.getUserById(userId);
    if (!user) {
        throw new EntityNotFoundError({ message: "User not found", code: "ERR_NF", statusCode: 404 });
    }

    // make the user prove they know the current password. This protects against someone
    // using a stolen token (or an unattended logged-in browser) to lock the real owner out.
    // We use 400 rather than 401/403 here so the frontend can tell "wrong password" apart from
    // "your session token is bad" (which authorize() reports as 401/403).
    if (!(await argon2.verify(user.password, currentPassword))) {
        throw new EntityNotFoundError({
            message: "Current password is incorrect",
            code: "ERR_BAD_PASSWORD",
            statusCode: 400
        });
    }

    const hashedPassword = await argon2.hash(newPassword);
    // this also bumps tokenVersion, which logs out every other session using an old token
    const updatedUser = await userModel.updatePassword(userId, hashedPassword);
    if (!updatedUser) {
        throw new EntityNotFoundError({ message: "User not found", code: "ERR_NF", statusCode: 404 });
    }

    // hand back a fresh token (with the new tokenVersion) so the session that made the change stays logged in
    const token = await generateToken(updatedUser);
    return { token };
}

export default {
    login,
    register,
    changePassword
}
import "dotenv/config";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import * as argon2 from "argon2";
import jwt from "jsonwebtoken";

// Mock the user model so these tests don't need a live MongoDB instance.
vi.mock("../../src/models/user.model.mts", () => ({
  default: {
    getUserByEmail: vi.fn(),
    getUserById: vi.fn(),
    createUser: vi.fn(),
    updatePassword: vi.fn()
  }
}));

const USER_ID = "64b7f0c2a1b2c3d4e5f60718";
const CURRENT = "oldpassword";

let userService;
let userModel;
let authorize;
let utils;
let storedHash;

beforeAll(async () => {
  userModel = (await import("../../src/models/user.model.mts")).default;
  userService = (await import("../../src/services/user.service.mts")).default;
  authorize = (await import("../../src/middleware/authorize.mts")).default;
  utils = await import("../../src/services/utils.mts");
  storedHash = await argon2.hash(CURRENT);
});

function makeUser(overrides = {}) {
  return {
    _id: USER_ID,
    email: "test@example.com",
    name: "Test",
    password: storedHash,
    tokenVersion: 0,
    createdAt: new Date(),
    modifiedAt: new Date(),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userModel.getUserById.mockResolvedValue(makeUser());
  userModel.getUserByEmail.mockResolvedValue(makeUser());
  // updatePassword returns the updated document, with tokenVersion bumped
  userModel.updatePassword.mockImplementation(async (id, hash) =>
    makeUser({ password: hash, tokenVersion: 1 })
  );
  userModel.createUser.mockResolvedValue({ insertedId: "new-id" });
});

describe("userService.login", () => {
  it("returns only public user fields, never the password hash", async () => {
    const { user, token } = await userService.login("test@example.com", CURRENT);

    expect(token).toBeTruthy();
    expect(user).toEqual({ _id: USER_ID, email: "test@example.com", name: "Test" });
    expect(user).not.toHaveProperty("password");
  });

  it("returns no user data when the password is wrong", async () => {
    const result = await userService.login("test@example.com", "wrongpassword");
    expect(result).toEqual({ user: null, token: null });
  });

  it("returns no user data when the user doesn't exist", async () => {
    userModel.getUserByEmail.mockResolvedValue(null);
    const result = await userService.login("nobody@example.com", CURRENT);
    expect(result).toEqual({ user: null, token: null });
  });
});

describe("userService.register", () => {
  beforeEach(() => {
    userModel.getUserByEmail.mockResolvedValue(null);
  });

  it("rejects a password shorter than 6 characters", async () => {
    await expect(
      userService.register("new@example.com", "short", "New User")
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(userModel.createUser).not.toHaveBeenCalled();
  });

  it("rejects a password longer than 100 characters", async () => {
    await expect(
      userService.register("new@example.com", "x".repeat(101), "New User")
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(userModel.createUser).not.toHaveBeenCalled();
  });

  it("stores a hash, not the plain password", async () => {
    await userService.register("new@example.com", "goodpassword", "New User");

    const saved = userModel.createUser.mock.calls[0][0];
    expect(saved.password).not.toBe("goodpassword");
    expect(await argon2.verify(saved.password, "goodpassword")).toBe(true);
    expect(saved.tokenVersion).toBe(0);
  });

  it("rejects an email that is already registered", async () => {
    userModel.getUserByEmail.mockResolvedValue(makeUser());
    await expect(
      userService.register("test@example.com", "goodpassword", "Test")
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("userService.changePassword", () => {
  it("hashes and saves the new password and returns a token with the new version", async () => {
    const { token } = await userService.changePassword(USER_ID, CURRENT, "newpassword");

    expect(userModel.updatePassword).toHaveBeenCalledTimes(1);
    const [id, hash] = userModel.updatePassword.mock.calls[0];
    expect(id).toBe(USER_ID);
    expect(hash).not.toBe("newpassword");
    expect(await argon2.verify(hash, "newpassword")).toBe(true);

    expect(jwt.decode(token)).toMatchObject({ id: USER_ID, tv: 1 });
  });

  it("rejects a wrong current password with 400 ERR_BAD_PASSWORD", async () => {
    await expect(
      userService.changePassword(USER_ID, "wrongpassword", "newpassword")
    ).rejects.toMatchObject({ statusCode: 400, code: "ERR_BAD_PASSWORD" });
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  it("rejects a new password shorter than 6 characters", async () => {
    await expect(
      userService.changePassword(USER_ID, CURRENT, "short")
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  it("rejects missing fields", async () => {
    await expect(
      userService.changePassword(USER_ID, undefined, "newpassword")
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      userService.changePassword(USER_ID, CURRENT, undefined)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  it("rejects a new password that matches the current one", async () => {
    await expect(
      userService.changePassword(USER_ID, CURRENT, CURRENT)
    ).rejects.toMatchObject({ statusCode: 400, code: "ERR_VALID" });
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  it("returns 404 when the user from the token no longer exists", async () => {
    userModel.getUserById.mockResolvedValue(null);
    await expect(
      userService.changePassword(USER_ID, CURRENT, "newpassword")
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });
});

describe("authorize middleware", () => {
  // minimal stand-ins for express req/res/next
  function run(authHeader) {
    const req = { headers: authHeader ? { authorization: authHeader } : {} };
    const res = {
      statusCode: 200,
      body: undefined,
      locals: {},
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    const next = vi.fn();
    return authorize(req, res, next).then(() => ({ res, next }));
  }

  it("lets a valid token through and sets res.locals.user", async () => {
    const token = await utils.generateToken(makeUser());
    const { res, next } = await run(`Bearer ${token}`);

    expect(next).toHaveBeenCalledWith();
    expect(res.locals.user).toEqual({
      id: USER_ID, _id: USER_ID, email: "test@example.com", name: "Test"
    });
  });

  it("rejects a missing token with 401", async () => {
    const { res, next } = await run(undefined);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a badly signed token with 403", async () => {
    const forged = jwt.sign({ id: USER_ID, email: "test@example.com", tv: 0 }, "not-the-secret");
    const { res, next } = await run(`Bearer ${forged}`);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a token issued before the password was changed", async () => {
    const oldToken = await utils.generateToken(makeUser({ tokenVersion: 0 }));
    // the password has since been changed, so the stored version moved on
    userModel.getUserById.mockResolvedValue(makeUser({ tokenVersion: 1 }));

    const { res, next } = await run(`Bearer ${oldToken}`);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("still accepts tokens from before token versions existed", async () => {
    // old tokens have no tv claim, old users have no tokenVersion field
    const legacyToken = jwt.sign({ id: USER_ID, email: "test@example.com" }, utils.getJwtSecret());
    const { tokenVersion, ...legacyUser } = makeUser();
    userModel.getUserById.mockResolvedValue(legacyUser);

    const { next } = await run(`Bearer ${legacyToken}`);
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects a token for a user that no longer exists", async () => {
    const token = await utils.generateToken(makeUser());
    userModel.getUserById.mockResolvedValue(null);

    const { res, next } = await run(`Bearer ${token}`);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

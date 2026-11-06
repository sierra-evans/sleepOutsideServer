import { Router } from "express";
import userService from "../services/user.service.mts";
import EntityNotFoundError from "../errors/EntityNotFoundError.mts";
import { sanitize } from "../services/utils.mts";
import authorize from "../middleware/authorize.mts"

const router: Router = Router();

router.post('/login', async (req, res, next) => {
    try {
        // get the email and password from the body of the request
        const cleanBody = sanitize(req.body)
        const { email, password } = cleanBody;
        // santize them

        // call the service function, pass in the email and password.
        // the service function should return a valid user and token  or null for either
        const results = await userService.login(email, password);
        // forward a 401 error if either is null
        if (!results.token || !results.user) {
            return next(new EntityNotFoundError({
                message: 'User Not Found or bad password', code: 'ERR_NF',
                statusCode: 401
            }))
        }
        // if both values exist, Send back the token and some user info in the response 
        // { token, user: { _id: user._id, email: user.email, name: user.name } }
        res.status(200).json(results)
    } catch (err) {
        next(err)
    }
});

router.post("/", async (req, res, next) => {
    try {
        const cleanBody = sanitize(req.body)
        const { email, name, password } = cleanBody;

        const newUser = await userService.register(email, password, name)
        res.status(200).json({ message: "User created successfully", userId: newUser.insertedId });
    } catch (err) {
        next(err)
    }

})

// Change the logged in user's password.
// Body: { currentPassword, newPassword }
// Response: { message, token } - the old token stops working, the client must switch to the new one.
// The user is identified by the token (res.locals.user.id), never by the body or URL,
// so a user can only change their own password.
router.patch('/password', authorize, async (req, res, next) => {
    try {
        const cleanBody = sanitize(req.body || {});
        const { currentPassword, newPassword } = cleanBody;

        // Changing the password revokes every existing token for this user, including the one
        // used for this request, so send back a new token for the client to use from now on.
        const { token } = await userService.changePassword(res.locals.user.id, currentPassword, newPassword);
        res.status(200).json({ message: "Password updated successfully", token });
    } catch (err) {
        next(err)
    }
});

router.get('/protected', authorize, (req, res) => {
    console.log(res.locals.user)
    res.json({ message: `Hello, ${res.locals.user.email}!` });
});

export default router
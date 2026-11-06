import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import userModel from '../models/user.model.mts';
import { getJwtSecret, type TokenPayload } from '../services/utils.mts';

// Middleware that only lets requests with a valid, non-revoked JWT through.
// On success res.locals.user is { id, _id, email, name } for the logged in user.
async function authorize(req: Request, res: Response, next: NextFunction) {
    // make sure there is an authorization header. It should look something like this:
    // Bearer asdasdsdjhasdljkashdljsahdljshljhsaldjs
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        // stop the request if the token is missing
        return res.status(401).json({ message: 'Unauthorized' });
    }
    // we just want the second part so we split(" ")
    const token = authHeader.split(' ')[1] || "";

    // check the signature and expiry
    let payload: TokenPayload;
    try {
        payload = jwt.verify(token, getJwtSecret()) as TokenPayload;
    } catch {
        //stop the request if the token is invalid
        return res.status(403).json({ message: 'Forbidden' });
    }

    try {
        // A token can be correctly signed and unexpired but still revoked: when a user changes their
        // password we bump user.tokenVersion, so any token carrying an older version is rejected.
        // Tokens issued before tokenVersion existed have no tv; treat that (and a user with no
        // tokenVersion) as version 0 so nobody gets logged out just because this check was added.
        const user = await userModel.getUserById(payload.id);
        if (!user || (user.tokenVersion ?? 0) !== (payload.tv ?? 0)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // set a copy of the user info into locals so we can see it in the routes.
        // Both id and _id are provided because different routes use different names.
        const id = String(user._id);
        res.locals.user = { id, _id: id, email: user.email, name: user.name };
        next();
    } catch (err) {
        next(err);
    }
}

export default authorize;

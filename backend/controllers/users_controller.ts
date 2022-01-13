import { Request, Response, NextFunction } from "express";
import { comparePassword, makeHashPassword } from "../lib/bcrypt";
import { clientIp, cleanIpDots } from "../lib/client_ip";
import * as database from "../lib/database";
import status_codes from "../lib/status_codes";
import store, { makeUserStoreId, setUserTokens } from "../lib/store";
import jwt from "jsonwebtoken";
const secrets = require("../configs/secrets.json");

import User from "../models/user";

export default {
    SigninAction: async (req: Request, res: Response, next: NextFunction) => {
        const client_ip = clientIp(req, res)?.toString();

        if (client_ip) {
            signinUserWithUserPassword(req.body.username, req.body.password).then(
                async (user: any) => {
                    // success

                    await setUserTokens(req.body.username, "refresh", cleanIpDots(client_ip)).then(
                        async (refresh_token) => {
                            // success
                            await setUserTokens(req.body.username, "auth", cleanIpDots(client_ip)).then(
                                async (auth_token) => {
                                    status_codes.success_signin(
                                        {
                                            user: {
                                                full_name: user.full_name,
                                                username: user.username,
                                                bio: user.bio,
                                                last_seen: user.last_seen,
                                                profile_photos: user.profile_photos,
                                                chats: [],
                                            },
                                            refresh_token: refresh_token,
                                            auth_token: auth_token,
                                        },
                                        req,
                                        res,
                                        next
                                    );
                                },
                                () => status_codes.error(req, res, next)
                            );
                        },
                        () => status_codes.error(req, res, next)
                    );
                },
                (state) => {
                    if (state == "not_found") {
                        status_codes.username_or_password_is_incorrect(req, res, next);
                    }
                    if (state == "error") {
                        status_codes.error(req, res, next);
                    }
                }
            );
        }
    },

    SignupAction: (req: Request, res: Response, next: NextFunction) => {
        const client_ip = clientIp(req, res)?.toString();
        if (client_ip) {
            checkUsernameUniqueness(req.body.username).then(
                () => {
                    makeHashPassword(req.body.password).then(
                        async (password_digest) => {
                            await setUserTokens(req.body.username, "refresh", cleanIpDots(client_ip)).then(
                                async (refresh_token) => {
                                    // success
                                    await setUserTokens(req.body.username, "auth", cleanIpDots(client_ip)).then(
                                        async (auth_token) => {
                                            // success
                                            const user = new User({
                                                full_name: req.body.full_name,
                                                username: req.body.username,
                                                password_digest: password_digest,
                                            });
                                            await user.save();
                                            status_codes.user_created(
                                                {
                                                    refresh_token: refresh_token,
                                                    auth_token: auth_token,
                                                },
                                                req,
                                                res,
                                                next
                                            );
                                        },
                                        () => status_codes.error(req, res, next)
                                    );
                                },
                                () => status_codes.error(req, res, next)
                            );
                        },
                        () => status_codes.error(req, res, next)
                    );
                },
                () => status_codes.username_already_registered(req, res, next)
            );
        }
    },

    RefreshTokenAction: (req: Request, res: Response, next: NextFunction) => {
        const client_ip = clientIp(req, res)?.toString();

        if (client_ip) {
            try {
                verifyRefreshToken(req.body.refresh_token, cleanIpDots(client_ip)).then(
                    async (user_username: any) => {
                        // valid
                        await setUserTokens(user_username, "auth", cleanIpDots(client_ip)).then(
                            async (auth_token) => {
                                // success
                                status_codes.success_signin(
                                    {
                                        auth_token: auth_token,
                                    },
                                    req,
                                    res,
                                    next
                                );
                            },
                            () => status_codes.error(req, res, next)
                        );
                    },
                    () => status_codes.invalid_token(req, res, next)
                );
            } catch (error) {
                return status_codes.invalid_token(req, res, next);
            }
        }
    },

    AuthenticationAction: (req: Request, res: Response, next: NextFunction) => {
        const client_ip = clientIp(req, res)?.toString();
        if (client_ip) {
            const user_id_in_store = makeUserStoreId(req.body.username, "auth", cleanIpDots(client_ip));
            store.get(user_id_in_store).then(async (token_in_store) => {
                if (String(token_in_store).trim() == String(req.body.auth_token).trim()) {
                    // success | requested token is valid
                    const user = await User.findOne({
                        username: req.body.username,
                    });
                    if (!user) return status_codes.invalid_token(req, res, next);
                    res.send({
                        message: "success",
                        data: {
                            full_name: user.full_name,
                            username: user.username,
                            bio: user.bio,
                            last_seen: user.last_seen,
                            profile_photos: user.profile_photos,
                            chats: [],
                        },
                    });
                } else {
                    status_codes.invalid_token(req, res, next);
                }
            });
        }
    },
};

export function signinUserWithUserPassword(username: string, password: string) {
    return new Promise(async (success: any, failed: any) => {
        const user = await User.findOne({
            username: username,
        });
        if (!user) {
            return failed("not_found");
        }
        comparePassword(password, user.password_digest).then(
            () => {
                success(user);
            },
            () => failed("not_found")
        );
    });
}

export function checkUsernameUniqueness(username: string) {
    return new Promise(async (deos_not_exists: any, exists: any) => {
        const result = await User.findOne({
            username: username,
        });
        if (result) {
            exists();
        } else {
            deos_not_exists();
        }
    });
}

export function verifyRefreshToken(token: string, client_ip: string) {
    return new Promise((valid: any, is_not_valid: any) => {
        jwt.verify(token, secrets.refresh_token, (err: any, decoded_jwt_token: any) => {
            const user_id_in_store = makeUserStoreId(decoded_jwt_token.username, "refresh", cleanIpDots(client_ip));
            if (err || !decoded_jwt_token) return is_not_valid();
            store.get(user_id_in_store).then(async (token_in_store) => {
                if (String(token_in_store).trim() == String(token).trim()) {
                    // success | requested token is valid
                    valid(decoded_jwt_token.username);
                } else {
                    is_not_valid();
                }
            });
        });
    });
}

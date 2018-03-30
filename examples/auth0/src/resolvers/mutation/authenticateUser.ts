import * as expressJwt from "express-jwt";
import * as jwt from "jsonwebtoken";
import * as jwksRsa from "jwks-rsa";
import { config } from "../../config";
import * as faker from "faker";
import * as fs from "fs";

import { AccessDeniedError } from "../../errors";

import { auth0 } from "../../auth0";

type auth0KeyCollection = {
    keys: auth0KeySet[];
};

type auth0KeySet = {
    alg: string;
    kty: string;
    use: string;
    x5c: string[];
    n: string;
    e: string;
    kid: string;
    x5t: string;
};

const auth0Jwks: auth0KeyCollection = JSON.parse(
    fs.readFileSync(config.auth0.jwksFile, "utf8"),
);

// From https://github.com/sgmeyer/auth0-node-jwks-rs256/blob/master/src/lib/utils.js
function certToPEM(cert) {
    cert = cert.match(/.{1,64}/g).join("\n");
    cert = `-----BEGIN CERTIFICATE-----\n${cert}\n-----END CERTIFICATE-----\n`;
    return cert;
}

async function authenticateUserResolver(
    root: any,
    args: any,
    context: any,
    info: any,
) {
    try {
        // The incoming JWT
        const idToken: string = args.idToken;

        // Defensively set verified to false
        let verified: any | boolean = false;

        // Decode the jwt
        const decoded: any = jwt.decode(idToken, {
            json: true,
            complete: true,
        });

        // Grab the alg from the config, and falback to RS256
        const alg: string = config.auth0.alg ? config.auth0.alg : "RS256";

        // Attempt to decode and verify the token
        if (
            decoded &&
            decoded.header &&
            decoded.header.alg === alg &&
            decoded.header.kid
        ) {
            // We're decoding the token, so we can get the key id (kid) from the header field
            // We'll then use this kid to find a key in our auth0 jwks, and attempt to verify it
            // against that key
            const keySet: auth0KeySet | undefined = auth0Jwks.keys.find(
                (keySet: auth0KeySet) => (keySet.kid = decoded.header.kid),
            );

            if (keySet) {
                // convert the x509 cert into a pem format
                const key: string = certToPEM(keySet.x5c[0]);
                // Attempt to verify the signature of the jwt with our auth0 key
                verified = jwt.verify(idToken, key, {
                    issuer: `https://${config.auth0.domain}/`,
                    audience: config.auth0.clientId,
                });
            }
        }

        // If verification worked we can return a jwt
        // You will likely want to extend this to create a user in your databse
        if (verified !== false && verified.email_verified) {
            return {
                token: jwt.sign(
                    {
                        iss: config.jwt.issuer,
                        aud: config.jwt.audience,
                        sub: verified.sub,
                        email: verified.email,
                        name: verified.name,
                        givenName: verified.given_name,
                        roles: ["authenticated user"],
                    },
                    config.jwt.secret,
                ),
                user: {
                    id: verified.sub,
                    email: verified.email,
                    name: verified.name,
                    givenName: verified.given_name,
                    roles: ["authenticated user"],
                },
            };
        }
        // If none of the above works, we throw a denied error.
        throw new AccessDeniedError();
    } catch (err) {
        console.log(err.message);
    }
}

export { authenticateUserResolver };

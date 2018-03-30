import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as mkdirp from "mkdirp";
import * as auth0Lib from "auth0-js";

import { config } from "../config";

/**
 * This helper function will (at runtime) download the latest keyset
 * for your Auth0 account and save it locally.
 *
 * This keyset contains the public key used to verify the JWT you get from
 * Auth0 is correctly signed, and valid.
 */
function downloadAuth0JKS(): Promise<void> {
    return new Promise((resolve: any, reject: any) => {
        // ensure our temp folder exists
        mkdirp.sync("./.auth0/", { mode: "0777" });

        const jwksFile: string = path.resolve("./.auth0/jwks.json");

        const url: string = `https://${
            config.auth0.domain
        }/.well-known/jwks.json`;

        // Create the file stream
        const file = fs.createWriteStream(jwksFile);

        // Download the file
        const request = https
            .get(url, function(response) {
                response.pipe(file);
                file.on("finish", function() {
                    file.close(); // close() is async, call cb after close completes.
                    resolve();
                });
            })
            .on("error", function(err) {
                // Handle errors
                fs.unlinkSync(jwksFile); // Delete the file async. (But we don't check the result)
                console.error(err.message);
                reject(err.message);
            });
    });
}

const auth0 = new auth0Lib.Authentication({
    domain: config.auth0.domain,
    clientID: config.auth0.clientID,
});

export { downloadAuth0JKS, auth0 };

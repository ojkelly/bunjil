import * as path from "path";
import * as yaml from "js-yaml";
import * as fs from "fs";

// Load the per env non secret config
const envConfigFile = path.join(__dirname, "../../../environment.yml");

const envConfigAll = yaml.safeLoad(fs.readFileSync(envConfigFile));
const config = {
    ...envConfigAll[process.env.NODE_ENV],
    auth0: {
        ...envConfigAll[process.env.NODE_ENV].auth0,
        jwksFile: "./.auth0/jwks.json",
    },
};

type Config = {
    auth0: auth0ConfigType;
    domain: string;
    graphQLEndpoint: string;
    jwt: {
        secret: string;
    };
    [name: string]: any;
};
type auth0ConfigType = {
    domain: string;
    clientID: string;
    redirectUri: string;
    audience: string;
    responseType: string;
    logoutReturnTo: string;
    scope: string;
    connections: [string];
    socialBigButtons: boolean;
    jwksFile: string;
    alg: string;
};

export { config };

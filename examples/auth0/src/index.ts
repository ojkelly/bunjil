import { downloadAuth0JKS } from "./auth0";

(async () => {
    // Download the auth0 keys
    await downloadAuth0JKS();

    // Start the server
    const { server } = await import("./server");
    server();
})();

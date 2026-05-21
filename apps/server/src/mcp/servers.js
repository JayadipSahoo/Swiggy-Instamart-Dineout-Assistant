import { McpStdioClient } from "./stdioClient.js";

function env(name, fallback = "") {
  return process.env[name] ?? fallback;
}

/**
 * Configure how to start each MCP server locally.
 *
 * You must set these env vars (examples):
 * - MCP_INSTAMART_CMD='npx -y <instamart-mcp-package>'
 * - MCP_FOOD_CMD='npx -y <food-mcp-package>'
 * - MCP_DINEOUT_CMD='npx -y <dineout-mcp-package>'
 *
 * If you already have a local clone of the MCP repo:
 * - MCP_INSTAMART_CMD='node ./path/to/instamart/server.js'
 */
/** @type {Record<string, McpStdioClient>} */
const clients = {};

export function getMcp(serverKey) {
  if (clients[serverKey]) return clients[serverKey];

  if (serverKey === "instamart") {
    clients[serverKey] = new McpStdioClient({ name: "instamart", command: env("MCP_INSTAMART_CMD") });
    return clients[serverKey];
  }
  if (serverKey === "food") {
    clients[serverKey] = new McpStdioClient({ name: "food", command: env("MCP_FOOD_CMD") });
    return clients[serverKey];
  }
  if (serverKey === "dineout") {
    clients[serverKey] = new McpStdioClient({ name: "dineout", command: env("MCP_DINEOUT_CMD") });
    return clients[serverKey];
  }

  throw new Error(`Unknown MCP server: ${serverKey}`);
}


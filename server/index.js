/**
 * Notion MCPB entry point.
 *
 * This bundle vendors the official Notion MCP CLI under
 * `server/notion-mcp-server/bin/cli.mjs` with its OpenAPI spec at
 * `server/notion-mcp-server/scripts/notion-openapi.json`.
 */

'use strict';

import('./notion-mcp-server/bin/cli.mjs').catch((err) => {
  console.error(`\nERROR: ${err?.message ?? String(err)}`);
  process.exit(1);
});

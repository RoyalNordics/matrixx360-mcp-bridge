// src/server.js
// Proper MCP HTTP server with a simple health_check tool

import express from "express";
import { z } from "zod";
import {
  McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { 
  StreamableHTTPServerTransport 
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Create MCP server instance
const server = new McpServer({
  name: "matrixx360-bridge",
  version: "1.0.0",
});

// --- TOOLS ------------------------------------------------------

// Simple health check tool so OpenAI can verify the bridge
server.registerTool(
  "health_check",
  {
    title: "Health check",
    description: "Returns basic status for the MatriXx360 MCP bridge.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      status: z.string(),
      uptimeSeconds: z.number(),
      timestamp: z.string(),
    }),
  },
  async () => {
    const output = {
      status: "ok",
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    };

    return {
      // What shows up in the model’s text view
      content: [
        {
          type: "text",
          text: JSON.stringify(output, null, 2),
        },
      ],
      // Structured result for the MCP client
      structuredContent: output,
    };
  }
);

// --- HTTP TRANSPORT --------------------------------------------

const app = express();
app.use(express.json());

// Root endpoint – just for manual browser check
app.get("/", (_req, res) => {
  res.type("text/plain").send(
    "MatriXx360 MCP Bridge is running. MCP endpoint: POST /mcp"
  );
});

// Main MCP endpoint – this is what OpenAI connects to
app.post("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("Error handling MCP request:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP server error" });
    }
  }
});

const port = parseInt(process.env.PORT || "10000", 10);

app
  .listen(port, () => {
    console.log(
      `MatriXx360 MCP Bridge running on http://localhost:${port}/mcp`
    );
  })
  .on("error", (error) => {
    console.error("Server error:", error);
    process.exit(1);
  });

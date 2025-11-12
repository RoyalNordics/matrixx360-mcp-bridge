// server.js
// MatriXx360 MCP Bridge — GitHub commits + (optional) Render deploy
// Node 18+, "type": "module" in package.json

import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json({ limit: "25mb" }));

// ---------- Environment ----------
const {
  GITHUB_OWNER,            // e.g. "RoyalNordics"
  GITHUB_REPO,             // e.g. "matrixx360-openai-builder"
  GITHUB_PAT,              // GitHub token with 'repo' scope
  DEFAULT_BRANCH = "main",
  // Optional Render deploy
  RENDER_API_KEY,          // Render API key
  RENDER_SERVICE_ID,       // Render service id
  // Optional extra auth for MCP (set both server and agent)
  MCP_TOKEN                // any shared secret (optional)
} = process.env;

// ---------- Optional: simple header auth for all MCP routes ----------
app.use((req, res, next) => {
  if (!MCP_TOKEN) return next(); // disabled unless set
  const token = req.headers["x-mcp-token"];
  if (token !== MCP_TOKEN) {
    return res.status(403).json({ ok: false, error: "Forbidden (MCP token missing/invalid)" });
  }
  next();
});

// ---------- Helpers ----------
function ghHeaders() {
  if (!GITHUB_PAT) throw new Error("GITHUB_PAT not set");
  return {
    "Authorization": `Bearer ${GITHUB_PAT}`,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json"
  };
}

async function ghJson(url, opts = {}) {
  const r = await fetch(url, opts);
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const msg = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`${r.status} ${r.statusText}: ${msg}`);
  }
  return data;
}

// Commit multiple files in one Git operation via Trees API
async function commitFiles({ branch, commitMessage, files }) {
  const b = branch || DEFAULT_BRANCH;

  // 1) Get ref (head SHA)
  const ref = await ghJson(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${b}`,
    { headers: ghHeaders() }
  );
  const baseSha = ref.object.sha;

  // 2) Get base commit (to fetch base tree)
  const baseCommit = await ghJson(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits/${baseSha}`,
    { headers: ghHeaders() }
  );

  // 3) Create tree with new/updated files
  const treeBody = {
    base_tree: baseCommit.tree.sha,
    tree: files.map(f => ({
      path: f.path,
      mode: "100644",
      type: "blob",
      content: f.content
    }))
  };
  const treeData = await ghJson(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees`,
    { method: "POST", headers: ghHeaders(), body: JSON.stringify(treeBody) }
  );

  // 4) Create commit
  const commitBody = {
    message: commitMessage || "Automated commit",
    tree: treeData.sha,
    parents: [baseSha]
  };
  const newCommit = await ghJson(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits`,
    { method: "POST", headers: ghHeaders(), body: JSON.stringify(commitBody) }
  );

  // 5) Update ref (fast-forward)
  await ghJson(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${b}`,
    { method: "PATCH", headers: ghHeaders(), body: JSON.stringify({ sha: newCommit.sha, force: false }) }
  );

  return { commitSha: newCommit.sha };
}

// ---------- MCP Tools ----------

// POST /mcp/git_commit_and_push
// Body: { branch?: string, commitMessage: string, files: [{ path, content }, ...] }
app.post("/mcp/git_commit_and_push", async (req, res) => {
  try {
    const { branch, commitMessage, files } = req.body || {};
    if (!commitMessage) return res.status(400).json({ ok: false, error: "commitMessage required" });
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ ok: false, error: "files[] required" });
    }
    if (!GITHUB_OWNER || !GITHUB_REPO) {
      return res.status(400).json({ ok: false, error: "GITHUB_OWNER/GITHUB_REPO not set" });
    }
    const result = await commitFiles({ branch, commitMessage, files });
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /mcp/render_deploy
// Triggers a new manual deploy on Render (optional)
app.post("/mcp/render_deploy", async (_req, res) => {
  try {
    if (!RENDER_API_KEY || !RENDER_SERVICE_ID) {
      return res.status(400).json({ ok: false, error: "RENDER_API_KEY/RENDER_SERVICE_ID not set" });
    }
    const r = await fetch(`https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RENDER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    return res.json({ ok: true, deploy: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Health ----------
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---------- MCP Discovery (Manifest + OpenAPI) ----------
app.get("/.well-known/ai-plugin.json", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  res.json({
    schema_version: "v1",
    name_for_human: "MatriXx360 MCP Bridge",
    name_for_model: "matrixx360_mcp_bridge",
    description_for_human: "Bridge server for GitHub commits and optional Render deployments.",
    description_for_model: "Provides tools to commit files to GitHub and to trigger Render deployments.",
    api: {
      type: "openapi",
      url: `${base}/openapi.json`
    },
    auth: { type: MCP_TOKEN ? "service_http" : "none" }
  });
});

app.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: { title: "MatriXx360 MCP Bridge API", version: "1.0.0" },
    paths: {
      "/mcp/git_commit_and_push": {
        post: {
          operationId: "git_commit_and_push",
          summary: "Commit and push code changes to GitHub",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    branch: { type: "string" },
                    commitMessage: { type: "string" },
                    files: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          path: { type: "string" },
                          content: { type: "string" }
                        },
                        required: ["path", "content"]
                      }
                    }
                  },
                  required: ["commitMessage", "files"]
                }
              }
            }
          },
          responses: {
            "200": { description: "Successful commit" },
            "400": { description: "Invalid input" },
            "500": { description: "Server error" }
          }
        }
      },
      "/mcp/render_deploy": {
        post: {
          operationId: "render_deploy",
          summary: "Trigger a deployment on Render",
          responses: {
            "200": { description: "Deployment triggered" },
            "400": { description: "Missing env" },
            "500": { description: "Server error" }
          }
        }
      },
      "/health": {
        get: {
          operationId: "health",
          summary: "Healthcheck",
          responses: { "200": { description: "OK" } }
        }
      }
    }
  });
});

// ---------- Start ----------
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`MCP bridge listening on ${port}`);
});

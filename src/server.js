import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { exec } from "child_process";
import util from "util";

const app = express();
const PORT = process.env.PORT || 10000;

const asyncExec = util.promisify(exec);

// ====== MIDDLEWARE ======
app.use(cors());
app.use(bodyParser.json());

// ===== MCP SCHEMA (Required by OpenAI) =====
app.get("/schema", (req, res) => {
  res.json({
    version: "1.0",
    name: "matrixx360_mcp_bridge",
    tools: [
      {
        name: "health_check",
        description: "Check if the MCP Bridge server is alive.",
        input_schema: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false
        }
      },
      {
        name: "git_commit_and_push",
        description: "Commit and push files to the configured GitHub repository.",
        input_schema: {
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
                required: ["path", "content"],
                additionalProperties: false
              }
            }
          },
          required: ["branch", "commitMessage", "files"],
          additionalProperties: false
        }
      },
      {
        name: "render_deploy",
        description: "Trigger a new deploy on a Render web service.",
        input_schema: {
          type: "object",
          properties: {
            serviceId: { type: "string" }
          },
          required: ["serviceId"],
          additionalProperties: false
        }
      }
    ]
  });
});

// ===== HEALTH CHECK =====
app.post("/tools/health_check", async (req, res) => {
  res.json({
    ok: true,
    message: "MCP Bridge is alive",
    timestamp: new Date().toISOString()
  });
});

// ===== GIT COMMIT & PUSH =====
app.post("/tools/git_commit_and_push", async (req, res) => {
  try {
    const { branch, commitMessage, files } = req.body;

    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const pat = process.env.GITHUB_PAT;

    if (!owner || !repo || !pat) {
      return res.status(500).json({
        ok: false,
        error: "Missing GitHub environment variables"
      });
    }

    // Write files to repo
    for (const file of files) {
      await asyncExec(`mkdir -p ${file.path.substring(0, file.path.lastIndexOf("/"))}`);
      await asyncExec(`echo "${file.content.replace(/"/g, '\\"')}" > ${file.path}`);
    }

    // Git commands
    await asyncExec("git config user.email 'autobot@matrixx360.com'");
    await asyncExec("git config user.name 'Matrixx360-AutoBuilder'");

    await asyncExec(`git add .`);
    await asyncExec(`git commit -m "${commitMessage}"`);
    await asyncExec(
      `git push https://${owner}:${pat}@github.com/${owner}/${repo}.git ${branch}`
    );

    res.json({ ok: true, message: "Commit & push successful" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== RENDER DEPLOY =====
app.post("/tools/render_deploy", async (req, res) => {
  try {
    const { serviceId } = req.body;
    const renderKey = process.env.RENDER_API_KEY;

    if (!renderKey) {
      return res.status(500).json({
        ok: false,
        error: "Missing RENDER_API_KEY"
      });
    }

    const response = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${renderKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ clearCache: true })
    });

    const data = await response.json();
    res.json({ ok: true, deploy: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log("============================================");
  console.log("🟢 MCP Bridge running");
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log("============================================");
});

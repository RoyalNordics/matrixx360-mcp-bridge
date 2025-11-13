import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import simpleGit from "simple-git";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Git config from Render environment variables
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_PAT = process.env.GITHUB_PAT;
const GITHUB_REPO = process.env.GITHUB_REPO;

// ===============================
//  MCP TOOL DEFINITIONS
// ===============================

const tools = {
  health_check: {
    name: "health_check",
    description: "Verify that the MCP server is online.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },

  git_commit_and_push: {
    name: "git_commit_and_push",
    description: "Commit & push files to GitHub repo defined by environment vars.",
    parameters: {
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
      required: ["branch", "commitMessage", "files"]
    }
  }
};

// ===============================
//  TOOL CALL HANDLER
// ===============================

app.post("/mcp", async (req, res) => {
  const { tool, input } = req.body;

  try {
    if (tool === "health_check") {
      return res.json({ ok: true, message: "MCP server online" });
    }

    if (tool === "git_commit_and_push") {
      const { branch, commitMessage, files } = input;

      const git = simpleGit();

      // Clone if not cloned
      const repoUrl = `https://${GITHUB_PAT}@github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git`;
      await git.clone(repoUrl, "/tmp/repo");
      await git.cwd("/tmp/repo");

      // Write files
      const fs = await import("fs");
      for (const f of files) {
        const filePath = `/tmp/repo/${f.path}`;
        fs.writeFileSync(filePath, f.content, "utf8");
      }

      // Commit & push
      await git.add(".");
      await git.commit(commitMessage);
      await git.push("origin", branch);

      return res.json({ ok: true, message: "Committed & pushed successfully" });
    }

    return res.status(400).json({ ok: false, error: "Unknown tool" });

  } catch (err) {
    console.error("MCP error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================
//  MCP TOOL LIST ENDPOINT
// ===============================

app.get("/tools", (req, res) => {
  res.json({ tools: Object.values(tools) });
});

// ===============================
//  START SERVER
// ===============================

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`MCP bridge running on port ${port}`));

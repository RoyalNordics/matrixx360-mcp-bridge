import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { Octokit } from "@octokit/rest";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// -----------------------------------------
// 1. Konfiguration
// -----------------------------------------
const GITHUB_OWNER = "RoyalNordics";
const TARGET_REPO = "matrixx360-app";         // ← det nye kode-repo
const BRANCH = "main";
const TOKEN = process.env.GITHUB_PAT;

const octokit = new Octokit({ auth: TOKEN });

// -----------------------------------------
// 2. Utility: create or update én fil i repoet
// -----------------------------------------
async function upsertFile(path, content, commitMessage) {
  try {
    let sha = null;

    // Find eksisterende fil (hvis den findes)
    try {
      const { data } = await octokit.repos.getContent({
        owner: GITHUB_OWNER,
        repo: TARGET_REPO,
        path
      });
      sha = data.sha;
    } catch (err) {
      // Hvis filen ikke findes, er det OK – sha forbliver null
    }

    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: TARGET_REPO,
      path,
      message: commitMessage,
      content: Buffer.from(content).toString("base64"),
      sha: sha || undefined,
      branch: BRANCH
    });

    return { ok: true, path };
  } catch (error) {
    return { ok: false, path, error: error.message };
  }
}

// -----------------------------------------
// 3. MCP-tool: git_commit_and_push
//    → Agenten kalder denne for at skrive filer
// -----------------------------------------
app.post("/mcp/git_commit_and_push", async (req, res) => {
  const { commitMessage, files } = req.body;

  if (!TOKEN) {
    return res.status(500).json({
      ok: false,
      error: "Missing GITHUB_PAT token on MCP server"
    });
  }

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "No files provided"
    });
  }

  const results = [];
  for (const file of files) {
    const result = await upsertFile(file.path, file.content, commitMessage);
    results.push(result);
  }

  res.json({
    ok: results.every(r => r.ok),
    results
  });
});

// -----------------------------------------
// 4. Tool-list endpoint (så Agent Builder kan “se” værktøjet)
// -----------------------------------------
app.get("/tools", (req, res) => {
  res.json({
    tools: [
      {
        name: "git_commit_and_push",
        description: "Commit & push files to the matrixx360-app repository",
        inputSchema: {
          type: "object",
          properties: {
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
          required: ["commitMessage", "files"],
          additionalProperties: false
        }
      }
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP bridge running on port ${PORT}`);
});

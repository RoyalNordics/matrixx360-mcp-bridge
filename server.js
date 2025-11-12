import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json({ limit: "25mb" }));

// ENV (sættes på Render)
const {
  GITHUB_OWNER,            // fx "RoyalNordics"
  GITHUB_REPO,             // fx "matrixx360-openai-builder"
  GITHUB_PAT,              // GitHub token med 'repo' scope
  DEFAULT_BRANCH = "main",
  RENDER_API_KEY,          // (valgfri) Render API key
  RENDER_SERVICE_ID        // (valgfri) Render service id
} = process.env;

function ghHeaders() {
  return {
    "Authorization": `Bearer ${GITHUB_PAT}`,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json"
  };
}

// Commit flere filer i ét hug via Git trees API
async function commitFiles({ branch, commitMessage, files }) {
  const b = branch || DEFAULT_BRANCH;

  // 1) Head ref
  const refRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${b}`,
    { headers: ghHeaders() }
  );
  if (!refRes.ok) throw new Error(`GitHub ref fetch failed: ${refRes.status} ${await refRes.text()}`);
  const ref = await refRes.json();
  const baseSha = ref.object.sha;

  // 2) Base commit
  const commitRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits/${baseSha}`,
    { headers: ghHeaders() }
  );
  if (!commitRes.ok) throw new Error(`GitHub base commit fetch failed: ${commitRes.status} ${await commitRes.text()}`);
  const baseCommit = await commitRes.json();

  // 3) Tree med nye/ændrede filer
  const treeRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees`,
    {
      method: "POST",
      headers: ghHeaders(),
      body: JSON.stringify({
        base_tree: baseCommit.tree.sha,
        tree: files.map(f => ({
          path: f.path,
          mode: "100644",
          type: "blob",
          content: f.content
        }))
      })
    }
  );
  if (!treeRes.ok) throw new Error(`GitHub tree create failed: ${treeRes.status} ${await treeRes.text()}`);
  const treeData = await treeRes.json();

  // 4) Commit
  const newCommitRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits`,
    {
      method: "POST",
      headers: ghHeaders(),
      body: JSON.stringify({
        message: commitMessage || "Automated commit",
        tree: treeData.sha,
        parents: [baseSha]
      })
    }
  );
  if (!newCommitRes.ok) throw new Error(`GitHub commit create failed: ${newCommitRes.status} ${await newCommitRes.text()}`);
  const newCommit = await newCommitRes.json();

  // 5) Fast-forward ref
  const updateRef = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${b}`,
    {
      method: "PATCH",
      headers: ghHeaders(),
      body: JSON.stringify({ sha: newCommit.sha, force: false })
    }
  );
  if (!updateRef.ok) throw new Error(`GitHub ref update failed: ${updateRef.status} ${await updateRef.text()}`);

  return { commitSha: newCommit.sha };
}

// MCP tool: commit & push
app.post("/mcp/git_commit_and_push", async (req, res) => {
  try {
    const { branch, commitMessage, files } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ ok: false, error: "files[] required" });
    }
    const result = await commitFiles({ branch, commitMessage, files });
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// MCP tool: Render deploy (valgfri)
app.post("/mcp/render_deploy", async (_req, res) => {
  try {
    if (!RENDER_API_KEY || !RENDER_SERVICE_ID) {
      return res.status(400).json({ ok: false, error: "Render env missing" });
    }
    const r = await fetch(
      `https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RENDER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      }
    );
    const data = await r.json();
    if (!r.ok) throw new Error(`Render deploy failed: ${r.status} ${JSON.stringify(data)}`);
    return res.json({ ok: true, deploy: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`MCP bridge on ${port}`));

const { Octokit } = require("@octokit/rest");

async function fetchPRContext() {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
  const pullNumber = parseInt(process.env.PR_NUMBER, 10);

  if (!owner || !repo || !pullNumber) {
    return { title: "", description: "", files_changed: 0 };
  }

  try {
    const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: pullNumber });
    const { data: files } = await octokit.pulls.listFiles({ owner, repo, pull_number: pullNumber, per_page: 100 });

    return {
      title: pr.title || "",
      description: pr.body || "",
      files_changed: files.length,
      additions: files.reduce((sum, f) => sum + f.additions, 0),
      deletions: files.reduce((sum, f) => sum + f.deletions, 0),
      files_list: files.map(f => `${f.status}: ${f.filename} (+${f.additions}/-${f.deletions})`).join("\n"),
    };
  } catch (err) {
    console.warn("Failed to fetch PR context:", err.message);
    return { title: "", description: "", files_changed: 0 };
  }
}

if (require.main === module) {
  const fs = require("fs");
  fetchPRContext().then(ctx => {
    fs.writeFileSync("pr-context.json", JSON.stringify(ctx, null, 2));
    console.log("✅ PR context fetched");
  });
}

module.exports = { fetchPRContext };

const { Octokit } = require("@octokit/rest");

async function fetchPRContext() {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
  const pullNumber = parseInt(process.env.PR_NUMBER, 10);

  if (!owner || !repo || !pullNumber) {
    return { title: "", description: "", files_changed: 0 };
  }

  try {
    const { data: pr } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });

    // Fetch linked issues + external tickets from PR body
    let linkedIssues = [];
    try {
      // GitHub issues: #123
      const issueRefs = (pr.body || "").match(/#(\d+)/g) || [];
      const issueNumbers = [...new Set(issueRefs.map((ref) => ref.slice(1)))];
      for (const num of issueNumbers.slice(0, 5)) {
        try {
          const { data: issue } = await octokit.issues.get({
            owner,
            repo,
            issue_number: parseInt(num, 10),
          });
          if (issue && !issue.pull_request) {
            linkedIssues.push({
              source: "github",
              id: `#${num}`,
              title: issue.title,
              labels: (issue.labels || []).map((l) => l.name),
            });
          }
        } catch (e) {}
      }

      // Jira tickets: PROJ-123
      const jiraRefs = (pr.body || "").match(/\b([A-Z][A-Z0-9]+-\d+)\b/g) || [];
      for (const ref of [...new Set(jiraRefs)].slice(0, 5)) {
        linkedIssues.push({
          source: "jira",
          id: ref,
          title: `Jira ticket ${ref}`,
        });
      }

      // Linear tickets: LIN-123
      const linearRefs = (pr.body || "").match(/\b(LIN-\d+)\b/gi) || [];
      for (const ref of [...new Set(linearRefs)].slice(0, 5)) {
        linkedIssues.push({
          source: "linear",
          id: ref.toUpperCase(),
          title: `Linear ticket ${ref.toUpperCase()}`,
        });
      }
    } catch (e) {}

    return {
      title: pr.title || "",
      description: pr.body || "",
      files_changed: files.length,
      additions: files.reduce((sum, f) => sum + f.additions, 0),
      deletions: files.reduce((sum, f) => sum + f.deletions, 0),
      files_list: files
        .map(
          (f) => `${f.status}: ${f.filename} (+${f.additions}/-${f.deletions})`,
        )
        .join("\n"),
      linked_issues: linkedIssues,
    };
  } catch (err) {
    console.warn("Failed to fetch PR context:", err.message);
    return { title: "", description: "", files_changed: 0 };
  }
}

if (require.main === module) {
  const fs = require("fs");
  fetchPRContext().then((ctx) => {
    fs.writeFileSync("pr-context.json", JSON.stringify(ctx, null, 2));
    console.log("✅ PR context fetched");
  });
}

module.exports = { fetchPRContext };

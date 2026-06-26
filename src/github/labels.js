const fs = require("fs");
const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
const pullNumber = process.env.PR_NUMBER;

if (!pullNumber) {
  console.error("PR_NUMBER not set");
  process.exit(1);
}

function inferLabels(risk, issues, prContext) {
  const labels = [];

  // Risk-based labels
  if (risk.level === "HIGH") labels.push("risk:high");
  else if (risk.level === "MEDIUM") labels.push("risk:medium");
  else labels.push("risk:low");

  // Issue count labels
  const blockers = issues.filter((i) => i.severity === "blocker").length;
  if (blockers > 0) labels.push("has-blockers");
  if (issues.length === 0) labels.push("clean");

  // File type labels (infer from changed files)
  const files = prContext?.files_list || "";
  if (files.match(/\.(sql|migration)/i)) labels.push("database");
  if (files.match(/\.(css|scss|less|tailwind)/i)) labels.push("ui");
  if (files.match(/\.(test|spec)\./i) || files.match(/\/tests?\//i)) labels.push("tests");
  if (files.match(/\.(yml|yaml|json|toml)/i)) labels.push("config");
  if (files.match(/Dockerfile|docker-compose/i)) labels.push("infra");
  if (files.match(/\.(md|mdx|rst)/i)) labels.push("docs");

  // Size labels
  const additions = prContext?.additions || 0;
  if (additions > 500) labels.push("size:xl");
  else if (additions > 100) labels.push("size:l");
  else if (additions > 30) labels.push("size:m");
  else labels.push("size:xs");

  return labels;
}

(async () => {
  let risk = { score: 0, level: "LOW" };
  let issues = [];
  let prContext = {};

  try {
    risk = JSON.parse(fs.readFileSync("risk.json", "utf8"));
  } catch (e) {}
  try {
    issues = JSON.parse(fs.readFileSync("final.review.json", "utf8"));
  } catch (e) {}
  try {
    prContext = JSON.parse(fs.readFileSync("pr-context.json", "utf8"));
  } catch (e) {}

  const labels = inferLabels(risk, issues, prContext);

  try {
    // Get existing labels to avoid duplicates
    const { data: existingLabels } = await octokit.issues.listLabelsOnIssue({
      owner,
      repo,
      issue_number: parseInt(pullNumber, 10),
    });
    const existingNames = existingLabels.map((l) => l.name);

    const newLabels = labels.filter((l) => !existingNames.includes(l));

    if (newLabels.length > 0) {
      await octokit.issues.addLabels({
        owner,
        repo,
        issue_number: parseInt(pullNumber, 10),
        labels: newLabels,
      });
      console.log(`✅ Added labels: ${newLabels.join(", ")}`);
    } else {
      console.log("✅ All labels already present");
    }
  } catch (err) {
    console.error("Failed to add labels:", err.message);
  }
})();

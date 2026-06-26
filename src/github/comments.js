const fs = require("fs");
const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
const pullNumber = process.env.PR_NUMBER;

if (!pullNumber) {
  console.error("PR_NUMBER not set");
  process.exit(1);
}

function loadPRContext() {
  try {
    return JSON.parse(fs.readFileSync("pr-context.json", "utf8"));
  } catch (e) {
    return null;
  }
}

(async () => {
  const risk = JSON.parse(fs.readFileSync("risk.json", "utf8"));
  const issues = JSON.parse(fs.readFileSync("final.review.json", "utf8"));
  const prContext = loadPRContext();

  const blockers = issues.filter((i) => i.severity === "blocker");
  const warnings = issues.filter((i) => i.severity === "warning");
  const suggestions = issues.filter((i) => i.severity === "suggestion");
  const withFixes = issues.filter(
    (i) => i.suggestion && i.suggestion !== "null",
  );

  const riskEmoji =
    risk.level === "HIGH" ? "🔴" : risk.level === "MEDIUM" ? "🟡" : "🟢";

  const body = `## 🤖 AI Code Review

${prContext?.title ? `**PR**: ${prContext.title}\n` : ""}
${riskEmoji} **Risk**: ${risk.level} (score: ${risk.score}) | **Files**: ${prContext?.files_changed || "?"} | +${prContext?.additions || "?"}/-${prContext?.deletions || "?"}

${
  issues.length === 0
    ? "### ✅ No issues found\n\nNo blockers, warnings, or suggestions detected."
    : `### Issues (${issues.length})
| Severity | Count |
|---|---|
${blockers.length ? `| 🔴 Blocker | ${blockers.length} |\n` : ""}${warnings.length ? `| 🟡 Warning | ${warnings.length} |\n` : ""}${suggestions.length ? `| 🔵 Suggestion | ${suggestions.length} |` : ""}

${withFixes.length > 0 ? `\n💡 ${withFixes.length} issue(s) include suggested fixes — click **Commit suggestion** on the inline comments.\n` : ""}

${blockers.length ? `\n#### 🔴 Blockers\n${blockers.map((i) => `- **\`${i.file || "?"}#L${i.line || "?"}\`**: ${i.message}`).join("\n")}\n` : ""}
${warnings.length ? `\n#### 🟡 Warnings\n${warnings.map((i) => `- **\`${i.file || "?"}#L${i.line || "?"}\`**: ${i.message}`).join("\n")}\n` : ""}`
}

---
<sub>Generated automatically. [Configurable](https://github.com/imtiyaazsalie/ai-pr-reviewer-template)</sub>`;

  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: parseInt(pullNumber, 10),
      body,
    });
    console.log("✅ Summary posted");
  } catch (err) {
    console.error("Failed to post summary:", err.message);
  }
})();

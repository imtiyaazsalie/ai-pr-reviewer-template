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

function formatIssue(issue) {
  const prefix =
    { blocker: "🔴", warning: "🟡", suggestion: "🔵" }[issue.severity] || "⚪";

  let sourceLabel = "";
  if (issue.source && issue.source !== "ai") {
    sourceLabel = ` [${issue.source}]`;
  }

  // Code files get file#Lline format
  if (issue.file && issue.line && !isDependencyFile(issue.file)) {
    return `${prefix} **\`${issue.file}#L${issue.line}\`**${sourceLabel}: ${issue.message}`;
  }

  // Dependency issues get package name format
  if (issue.file && isDependencyFile(issue.file)) {
    return `${prefix} ${sourceLabel} ${issue.message}`;
  }

  // No file info — just message
  return `${prefix}${sourceLabel} ${issue.message}`;
}

function isDependencyFile(filePath) {
  return (
    !filePath ||
    !filePath.includes("/") ||
    !filePath.includes(".") ||
    filePath.endsWith(".lock") ||
    /^[a-z][a-z0-9._-]*\/[a-z]/.test(filePath) || // npm/composer style
    !fs.existsSync(filePath)
  );
}

(async () => {
  const risk = JSON.parse(fs.readFileSync("risk.json", "utf8"));
  const issues = JSON.parse(fs.readFileSync("final.review.json", "utf8"));
  const prContext = loadPRContext();

  let changeSummary = null;
  try {
    changeSummary = JSON.parse(fs.readFileSync("pr-summary.json", "utf8"));
  } catch (e) {}

  // Separate AI issues from tool issues
  const aiIssues = issues.filter((i) => !i.source || i.source === "ai");
  const toolIssues = issues.filter((i) => i.source && i.source !== "ai");

  // Categorize
  const codeIssues = aiIssues.filter(
    (i) => i.file && !isDependencyFile(i.file),
  );
  const depIssues = [
    ...aiIssues.filter((i) => !i.file || isDependencyFile(i.file)),
    ...toolIssues,
  ];

  const blockers = codeIssues.filter((i) => i.severity === "blocker");
  const warnings = codeIssues.filter((i) => i.severity === "warning");
  const suggestions = codeIssues.filter((i) => i.severity === "suggestion");
  const withFixes = codeIssues.filter(
    (i) => i.suggestion && i.suggestion !== "null",
  );

  const riskEmoji =
    risk.level === "HIGH" ? "🔴" : risk.level === "MEDIUM" ? "🟡" : "🟢";

  const parts = [];

  // Header
  parts.push("## 🤖 AI Code Review");
  if (changeSummary?.one_liner) {
    parts.push(`\n> ${changeSummary.one_liner}`);
  }
  parts.push(
    `\n${riskEmoji} **Risk**: ${risk.level} (score: ${risk.score}) | **Files**: ${prContext?.files_changed || "?"} | +${prContext?.additions || "?"} / -${prContext?.deletions || "?"}`,
  );

  // Code issues (AI findings)
  if (codeIssues.length > 0) {
    parts.push(`\n### 📝 Code Review (${codeIssues.length} issues)`);
    parts.push("\n| Severity | Count |");
    parts.push("|---|---|");
    if (blockers.length) parts.push(`| 🔴 Blocker | ${blockers.length} |`);
    if (warnings.length) parts.push(`| 🟡 Warning | ${warnings.length} |`);
    if (suggestions.length)
      parts.push(`| 🔵 Suggestion | ${suggestions.length} |`);
    if (withFixes.length) {
      parts.push(
        `\n💡 **${withFixes.length} issue(s) have suggested fixes** — click the inline comments to commit.`,
      );
    }
    if (blockers.length) {
      parts.push(`\n#### 🔴 Blockers`);
      blockers.forEach((i) => parts.push(`- ${formatIssue(i)}`));
    }
    if (warnings.length) {
      parts.push(`\n#### 🟡 Warnings`);
      warnings.forEach((i) => parts.push(`- ${formatIssue(i)}`));
    }
    if (suggestions.length) {
      parts.push(`\n#### 🔵 Suggestions`);
      suggestions.forEach((i) => parts.push(`- ${formatIssue(i)}`));
    }
  } else {
    parts.push("\n### 📝 Code Review");
    parts.push(
      "\nNo code-level issues detected in the diff. " +
        (toolIssues.length > 0
          ? "See below for dependency and security scan results."
          : ""),
    );
  }

  // Dependency & security issues (tools)
  if (depIssues.length > 0) {
    parts.push(`\n### 📦 Dependencies & Security (${depIssues.length} issues)`);
    parts.push("\nFound by automated scanners — not AI-reviewed.");
    const bySource = {};
    depIssues.forEach((i) => {
      const src = i.source || "unknown";
      if (!bySource[src]) bySource[src] = [];
      bySource[src].push(i);
    });

    for (const [source, srcIssues] of Object.entries(bySource)) {
      const sourceLabel =
        {
          megalinter: "MegaLinter",
          trivy: "Trivy",
          "osv-scanner": "OSV-Scanner",
          semgrep: "Semgrep",
        }[source] || source;
      parts.push(`\n**${sourceLabel}** (${srcIssues.length}):`);
      srcIssues.slice(0, 15).forEach((i) => parts.push(`- ${i.message}`));
      if (srcIssues.length > 15) {
        parts.push(`- ... and ${srcIssues.length - 15} more`);
      }
    }
  }

  // Summary section
  parts.push("\n---");
  const toolNames = [
    ...new Set(toolIssues.map((i) => i.source).filter(Boolean)),
  ];
  if (toolNames.length > 0) {
    parts.push(
      `\n🔍 Static analysis: ${toolNames.join(", ")} | 🤖 AI review: ${codeIssues.length} findings`,
    );
  }
  parts.push(
    "<sub>[Configurable](https://github.com/imtiyaazsalie/ai-pr-reviewer-template)</sub>",
  );

  const body = parts.join("\n");

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

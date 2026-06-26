const fs = require("fs");
const { Octokit } = require("@octokit/rest");
const { mapToLines } = require("../mapping/lineMapper");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
const pullNumber = process.env.PR_NUMBER;

if (!pullNumber) {
  console.error("PR_NUMBER not set");
  process.exit(1);
}

function formatComment(issue) {
  const label =
    {
      blocker: "🔴 Blocker",
      warning: "🟡 Warning",
      suggestion: "🔵 Suggestion",
    }[issue.severity] || "📝 Note";

  const parts = [
    `**${label}${
      issue.confidence ? ` (${Math.round(issue.confidence * 100)}% sure)` : ""
    }**: ${issue.message}`,
  ];

  // Add suggested fix if available
  if (
    issue.suggestion &&
    issue.suggestion !== "null" &&
    issue.suggestion.length > 0
  ) {
    const suggestion = issue.suggestion;
    const lines = suggestion.split("\n");
    const isMultiLine = lines.length > 1;
    const codeFence = isMultiLine ? "```suggestion" : "```suggestion";
    parts.push(`\n${codeFence}\n${suggestion}\n\`\`\``);
  }

  parts.push(`\n<sub>🤖 AI reviewer</sub>`);
  return parts.join("\n");
}

(async () => {
  const finalReview = JSON.parse(fs.readFileSync("final.review.json", "utf8"));
  if (!finalReview.length) {
    console.log("No issues to comment");
    return;
  }

  const diffRaw = fs.readFileSync("diff.raw", "utf8");
  const fileSections = diffRaw.split("FILE:").filter(Boolean);

  let posted = 0;
  let skipped = 0;

  for (const issue of finalReview) {
    const targetFile = issue.file;
    if (!targetFile) {
      console.warn("Issue missing file, skipping");
      skipped++;
      continue;
    }

    const fileSection = fileSections.find((s) =>
      s.trim().startsWith(targetFile),
    );
    if (!fileSection) {
      console.warn(`No diff for ${targetFile}`);
      skipped++;
      continue;
    }

    const lineMap = mapToLines(fileSection);
    let lineNumber = issue.line;

    if (!lineNumber) {
      const content = issue.message?.substring(0, 30);
      if (content) {
        const match = Object.entries(lineMap).find(([_, text]) =>
          text.includes(content),
        );
        if (match) lineNumber = parseInt(match[0], 10);
      }
    }

    if (!lineNumber || !lineMap[lineNumber]) {
      console.warn(
        `Cannot map line for ${targetFile} (message: ${issue.message?.substring(0, 40)})`,
      );
      skipped++;
      continue;
    }

    const body = formatComment(issue);

    try {
      await octokit.pulls.createReviewComment({
        owner,
        repo,
        pull_number: parseInt(pullNumber, 10),
        body,
        commit_id: process.env.GITHUB_SHA,
        path: targetFile,
        line: lineNumber,
        side: "RIGHT",
      });
      const hasSuggestion = issue.suggestion && issue.suggestion !== "null";
      console.log(
        `✅ ${targetFile}#L${lineNumber}${hasSuggestion ? " (with fix)" : ""}`,
      );
      posted++;
    } catch (err) {
      // Retry without commit_id (some API versions don't need it)
      if (err.message.includes("commit_id")) {
        try {
          await octokit.pulls.createReviewComment({
            owner,
            repo,
            pull_number: parseInt(pullNumber, 10),
            body,
            path: targetFile,
            line: lineNumber,
            side: "RIGHT",
          });
          console.log(`✅ ${targetFile}#L${lineNumber} (retry)`);
          posted++;
        } catch (err2) {
          console.error(`Failed: ${err2.message}`);
          skipped++;
        }
      } else {
        console.error(`Failed: ${err.message}`);
        skipped++;
      }
    }
  }

  console.log(`📊 Posted ${posted} comments, skipped ${skipped}`);
})();

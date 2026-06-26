const fs = require("fs");
const { callLLM } = require("./client");

const SUMMARY_PROMPT = `You are a senior engineer summarizing a pull request for code review.

Given the PR title, description, and list of changed files, write a concise summary:

1. **What changed** (1 sentence) — the overall goal
2. **Key files** (bullet list) — 3-5 most important files and what changed in each
3. **Review focus** (1 sentence) — what reviewers should pay attention to

Keep it under 200 words. Be specific. Do NOT say "various changes" or "several files".

Output as JSON:
{
  "one_liner": "short summary",
  "key_files": ["file: what changed", ...],
  "review_focus": "what to watch for"
}

Output only valid JSON.`;

(async () => {
  let prContext = {};
  try {
    prContext = JSON.parse(fs.readFileSync("pr-context.json", "utf8"));
  } catch (e) {
    console.log("No PR context, skipping summary");
    fs.writeFileSync("pr-summary.json", JSON.stringify({ one_liner: "", key_files: [], review_focus: "" }));
    return;
  }

  if (!prContext.title) {
    fs.writeFileSync("pr-summary.json", JSON.stringify({ one_liner: "", key_files: [], review_focus: "" }));
    return;
  }

  const prompt = [
    `PR Title: ${prContext.title}`,
    prContext.description ? `Description: ${prContext.description.slice(0, 1500)}` : "",
    `Stats: ${prContext.files_changed} files, +${prContext.additions}/-${prContext.deletions}`,
    `\nFiles:\n${prContext.files_list}`,
  ].filter(Boolean).join("\n");

  try {
    const response = await callLLM([
      { role: "system", content: SUMMARY_PROMPT },
      { role: "user", content: prompt },
    ]);

    let summary = { one_liner: "", key_files: [], review_focus: "" };
    try {
      summary = JSON.parse(response);
    } catch (e) {
      const match = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (match) {
        try { summary = JSON.parse(match[1]); } catch (e2) {}
      } else {
        summary = { one_liner: response.split("\n")[0] || "", key_files: [], review_focus: "" };
      }
    }

    fs.writeFileSync("pr-summary.json", JSON.stringify(summary, null, 2));
    console.log("✅ Change summary generated");
  } catch (err) {
    console.error("Summary generation failed:", err.message);
    fs.writeFileSync("pr-summary.json", JSON.stringify({ one_liner: "", key_files: [], review_focus: "" }));
  }
})();

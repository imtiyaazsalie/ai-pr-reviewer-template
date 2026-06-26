const fs = require("fs");
const { callLLM } = require("./client");

const IMPROVE_PROMPT = `You are a senior engineer suggesting code improvements.

The review already caught bugs, security issues, and blockers.
Your job is DIFFERENT: suggest refactoring and quality improvements.

## What to suggest
- Simpler ways to express the same logic
- Opportunities to reduce duplication
- Better error messages or logging
- Performance micro-optimizations (caching, early returns)
- Missing type hints, docblocks, or comments on tricky sections
- Testability improvements (dependency injection, pure functions)

## What NOT to suggest
- Style, formatting, or naming (those are handled by linters)
- Things already flagged in the review
- Major architectural changes

## Output format
Return a JSON array:
[{
  "file": "path/to/file.ext",
  "line": <number>,
  "message": "what could be improved",
  "suggestion": "specific code showing the improvement"
}]

Keep suggestions actionable — show the exact code change.
If nothing to improve, return [].
Only valid JSON.`;

(async () => {
  let diffSample = "";
  try {
    diffSample = fs.readFileSync("diff.raw", "utf8").slice(0, 6000);
  } catch (e) {
    console.log("No diff to improve");
    fs.writeFileSync("improve.json", JSON.stringify([], null, 2));
    return;
  }

  // Load existing review to avoid suggesting things already flagged
  let existingIssues = [];
  try {
    existingIssues = JSON.parse(fs.readFileSync("final.review.json", "utf8"));
  } catch (e) {}

  const alreadyFlagged = existingIssues
    .map((i) => `${i.file}#L${i.line}: ${i.message}`)
    .join("\n");

  const prompt = [
    "## PR Diff",
    diffSample,
    alreadyFlagged
      ? `\n## Already flagged (do NOT repeat these):\n${alreadyFlagged}`
      : "",
    "\n## Instructions",
    "Suggest code improvements NOT already flagged above.",
    "Focus on: readability, maintainability, performance, testability.",
  ].join("\n");

  try {
    const response = await callLLM(
      [
        { role: "system", content: IMPROVE_PROMPT },
        { role: "user", content: prompt },
      ],
      0.3,
      2000,
    );

    let improvements = [];
    try {
      improvements = JSON.parse(response);
      if (!Array.isArray(improvements)) improvements = [improvements];
    } catch (e) {
      const match = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (match) {
        try { improvements = JSON.parse(match[1]); } catch (e2) {}
      }
    }

    fs.writeFileSync("improve.json", JSON.stringify(improvements, null, 2));
    console.log(`✅ Improve: ${improvements.length} suggestions`);

    // Merge into final review if there are suggestions
    if (improvements.length > 0 && existingIssues.length > 0) {
      const improved = improvements.map((imp) => ({
        ...imp,
        severity: "suggestion",
        source: "improve",
        confidence: 0.7,
      }));
      const merged = [...existingIssues, ...improved];
      fs.writeFileSync("final.review.json", JSON.stringify(merged, null, 2));
      console.log(`✅ Merged ${improvements.length} improvements into review`);
    }
  } catch (err) {
    console.error("Improve failed:", err.message);
    fs.writeFileSync("improve.json", JSON.stringify([], null, 2));
  }
})();

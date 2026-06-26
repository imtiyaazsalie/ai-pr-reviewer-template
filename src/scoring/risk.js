const fs = require("fs");

function computeRiskScore(issues, diffRaw) {
  let score = 0;
  issues.forEach((issue) => {
    const severity = issue.severity || "warning";
    let points = { blocker: 5, warning: 2, suggestion: 1 }[severity] || 1;
    if (
      issue.file &&
      (issue.file.includes("/core/") || issue.file.includes("auth"))
    )
      points *= 2;
    score += points;
  });

  const addedLines = (diffRaw.match(/\n\+/g) || []).length;
  score += Math.floor(addedLines / 100);

  const level = score > 12 ? "HIGH" : score > 5 ? "MEDIUM" : "LOW";
  return { score, level, addedLines };
}

// CLI entry point
if (require.main === module) {
  const review = JSON.parse(fs.readFileSync("final.review.json", "utf8"));
  const diffRaw = fs.readFileSync("diff.raw", "utf8");
  const result = computeRiskScore(review, diffRaw);
  fs.writeFileSync("risk.json", JSON.stringify(result));
  console.log(`✅ Risk: ${result.level} (${result.score})`);
}

module.exports = { computeRiskScore };

const fs = require("fs");
const path = require("path");

const LEARNING_FILE = ".ai-cache/learning.json";
const LEARNING_DIR = ".ai-cache";

function loadLearning() {
  try {
    return JSON.parse(fs.readFileSync(LEARNING_FILE, "utf8"));
  } catch (e) {
    return { dismissed_patterns: [], suppressed_files: [], last_updated: null };
  }
}

function saveLearning(data) {
  if (!fs.existsSync(LEARNING_DIR)) fs.mkdirSync(LEARNING_DIR, { recursive: true });
  data.last_updated = new Date().toISOString();
  fs.writeFileSync(LEARNING_FILE, JSON.stringify(data, null, 2));
}

(async () => {
  const reviewState = process.env.REVIEW_STATE;
  const pullNumber = process.env.PR_NUMBER;

  if (!reviewState || !pullNumber) {
    console.log("Missing REVIEW_STATE or PR_NUMBER, skipping learning");
    return;
  }

  const learning = loadLearning();

  // Track reviews that were dismissed (reviewer said "this is wrong")
  if (reviewState === "dismissed") {
    // Read the current PR's review issues to learn which files/patterns were dismissed
    let finalReview = [];
    try {
      finalReview = JSON.parse(fs.readFileSync("final.review.json", "utf8"));
    } catch (e) {}

    if (finalReview.length > 0) {
      // Extract patterns from dismissed reviews
      const files = [...new Set(finalReview.map((i) => i.file).filter(Boolean))];
      const patterns = finalReview
        .filter((i) => i.message)
        .map((i) => ({
          file_pattern: i.file || "*",
          issue_pattern: i.message.slice(0, 80),
          type: i.severity || "unknown",
          dismissed_at: new Date().toISOString(),
        }));

      // Merge with existing — keep unique patterns
      for (const p of patterns) {
        const exists = learning.dismissed_patterns.some(
          (ep) =>
            ep.file_pattern === p.file_pattern &&
            ep.issue_pattern === p.issue_pattern,
        );
        if (!exists) {
          learning.dismissed_patterns.push(p);
        }
      }

      // Cap at 50 entries to keep file small
      if (learning.dismissed_patterns.length > 50) {
        learning.dismissed_patterns = learning.dismissed_patterns.slice(-50);
      }

      // Add files that had reviews dismissed
      for (const f of files) {
        const exists = learning.suppressed_files.some(
          (sf) => sf.file_pattern === f,
        );
        if (!exists) {
          learning.suppressed_files.push({
            file_pattern: f,
            note: `Review dismissed on PR #${pullNumber}`,
            added_at: new Date().toISOString(),
          });
        }
      }

      saveLearning(learning);
      console.log(`✅ Learning updated: ${patterns.length} patterns from dismissed review`);
    } else {
      console.log("No review data to learn from");
    }
  } else {
    console.log(`Review state "${reviewState}" — no learning action`);
  }
})();

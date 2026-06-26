const fs = require("fs");
const path = require("path");

const CACHE_DIR = ".ai-cache";
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

function getCacheKey() {
  return (
    process.env.GITHUB_SHA ||
    require("child_process").execSync("git rev-parse HEAD").toString().trim()
  );
}

function isCached() {
  return fs.existsSync(path.join(CACHE_DIR, `${getCacheKey()}.json`));
}

function loadCache() {
  const file = path.join(CACHE_DIR, `${getCacheKey()}.json`);
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(
      "final.review.json",
      JSON.stringify(data.finalReview, null, 2),
    );
    fs.writeFileSync("risk.json", JSON.stringify(data.risk, null, 2));
    return true;
  }
  return false;
}

function saveCache() {
  const finalReview = JSON.parse(fs.readFileSync("final.review.json", "utf8"));
  const risk = JSON.parse(fs.readFileSync("risk.json", "utf8"));
  const file = path.join(CACHE_DIR, `${getCacheKey()}.json`);
  fs.writeFileSync(file, JSON.stringify({ finalReview, risk }, null, 2));
  console.log("✅ Cache saved");
}

if (process.argv.includes("--save")) {
  saveCache();
} else {
  const cached = loadCache();
  if (cached) {
    console.log("✅ Cache hit — skipping analysis");
    process.exit(0);
  } else {
    console.log("ℹ️ No cache found — running analysis");
    process.exit(1);
  }
}

module.exports = { isCached, loadCache, saveCache };

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
    if (data.prContext) {
      fs.writeFileSync(
        "pr-context.json",
        JSON.stringify(data.prContext, null, 2),
      );
    }
    if (data.fileMeta) {
      fs.writeFileSync(
        "file-meta.json",
        JSON.stringify(data.fileMeta, null, 2),
      );
    }
    return true;
  }
  return false;
}

function saveCache() {
  const finalReview = JSON.parse(fs.readFileSync("final.review.json", "utf8"));
  const risk = JSON.parse(fs.readFileSync("risk.json", "utf8"));
  let prContext = null;
  let fileMeta = null;
  try {
    prContext = JSON.parse(fs.readFileSync("pr-context.json", "utf8"));
  } catch (e) {}
  try {
    fileMeta = JSON.parse(fs.readFileSync("file-meta.json", "utf8"));
  } catch (e) {}
  const file = path.join(CACHE_DIR, `${getCacheKey()}.json`);
  // Save last reviewed commit for incremental review tracking
  const incremental = {
    last_reviewed_sha: getCacheKey(),
    reviewed_at: new Date().toISOString(),
  };
  fs.writeFileSync(
    file,
    JSON.stringify(
      { finalReview, risk, prContext, fileMeta, incremental },
      null,
      2,
    ),
  );
  console.log("✅ Cache saved");
}

function getLastReviewedSha() {
  const cacheFile = path.join(CACHE_DIR, getCacheKey() + ".json");
  if (fs.existsSync(cacheFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      return data.incremental?.last_reviewed_sha || null;
    } catch (e) {}
  }
  // Fallback: check any recent cache for incremental tracking
  try {
    const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
    for (const f of files.reverse()) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(CACHE_DIR, f), "utf8"),
        );
        if (data.incremental?.last_reviewed_sha) {
          return data.incremental.last_reviewed_sha;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return null;
}

if (require.main === module) {
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
}

module.exports = { isCached, loadCache, saveCache, getLastReviewedSha };

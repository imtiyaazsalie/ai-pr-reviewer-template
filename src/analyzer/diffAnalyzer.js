const { execSync } = require("child_process");
const fs = require("fs");
const yaml = require("js-yaml");

const base = process.env.GITHUB_BASE_REF || "main";
try {
  execSync(`git fetch origin ${base}`);
} catch (e) {
  console.warn("Failed to fetch base branch, using local HEAD");
}

// Incremental review: only diff files changed since last review
let reviewRange = `origin/${base}...HEAD`;
try {
  const { getLastReviewedSha } = require("../cache/cache");
  const lastSha = getLastReviewedSha();
  if (lastSha) {
    reviewRange = `${lastSha}...HEAD`;
    console.log(
      `🔍 Incremental review: only changes since ${lastSha.slice(0, 8)}`,
    );
  }
} catch (e) {}

let files = execSync(`git diff --name-only ${reviewRange}`)
  .toString()
  .split("\n")
  .filter(Boolean);

// Load config (supports both monorepo.yml and .ai-reviewer.yml)
let config = { workspaces: [], ignore: [], rules: [], review: {} };
const configPath = process.env.CONFIG_PATH || "config/monorepo.yml";
try {
  if (fs.existsSync(configPath)) {
    config = yaml.load(fs.readFileSync(configPath, "utf8"));
  }
} catch (e) {
  /* no config */
}

// Built-in ignore patterns for generated / non-reviewable files
const BUILTIN_IGNORE = [
  /\/\.git\//,
  /node_modules\//,
  /\/dist\//,
  /\/build\//,
  /\/out\//,
  /\.lock$/,
  /\.min\.(js|css)$/,
  /\.generated\./,
  /\/generated\//,
  /\/vendor\//,
  /\/third_party\//,
  /\.pb\.(go|cc|java)$/, // protobuf generated
  /\.g\.(ts|tsx)$/, // GraphQL generated
  /\/mocks\//,
  /\/stubs\//,
  /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/,
  /\/docs\//,
  /CHANGELOG\.md$/i,
];

// Check if a file has a @generated marker
function isGeneratedFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const head = fs.readFileSync(filePath, "utf8").slice(0, 4096);
    return /@generated|auto-generated|DO NOT EDIT|AUTO-GENERATED/i.test(head);
  } catch (e) {
    return false;
  }
}

// Check if a file is in a test directory or is a test file
function isTestFile(filePath) {
  return (
    /\/(test|tests|spec|specs|__tests__|fixtures|snapshots)\//.test(filePath) ||
    /\.(test|spec|snap)\.\w+$/.test(filePath) ||
    /(^|\/)(setupTests|setup|teardown|jest\.config|vitest\.config)\.\w+$/.test(
      filePath,
    )
  );
}

const filtered = files.filter((f) => {
  // Config-level ignore patterns
  if (
    config.ignore &&
    config.ignore.some((pattern) => {
      const regex = new RegExp(
        pattern.replace(/\*/g, ".*").replace(/\//g, "\\/"),
      );
      return regex.test(f);
    })
  ) {
    console.log(`  ⏭️  Skipped (config ignore): ${f}`);
    return false;
  }

  // Built-in ignore patterns
  if (BUILTIN_IGNORE.some((pattern) => pattern.test(f))) {
    console.log(`  ⏭️  Skipped (generated/asset): ${f}`);
    return false;
  }

  // Check for @generated markers
  if (isGeneratedFile(f)) {
    console.log(`  ⏭️  Skipped (@generated): ${f}`);
    return false;
  }

  // Workspace filter
  if (config.workspaces && config.workspaces.length) {
    return config.workspaces.some((ws) => f.startsWith(ws.replace("*", "")));
  }

  return true;
});

// Write file metadata (test vs prod) for pass1 context
const fileMeta = {};
filtered.forEach((f) => {
  fileMeta[f] = {
    is_test: isTestFile(f),
    has_rules: !!(config.rules || []).find((r) => f.startsWith(r.path || "")),
  };
});

let diff = "";
for (const file of filtered) {
  diff += `\nFILE: ${file}\n`;
  diff += execSync(`git diff ${reviewRange} -- ${file}`).toString();
}

fs.writeFileSync("diff.raw", diff);
fs.writeFileSync("file-meta.json", JSON.stringify(fileMeta, null, 2));
// Save config for pass1.js to read
fs.writeFileSync("review-config.json", JSON.stringify(config, null, 2));
console.log(
  `✅ Diff saved, ${filtered.length} files (${files.length - filtered.length} skipped)`,
);

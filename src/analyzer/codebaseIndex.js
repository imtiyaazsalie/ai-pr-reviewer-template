const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Build a lightweight codebase index — all class/function/interface signatures
// This gives the AI global context without needing a vector database

const EXTS = [".php", ".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".go", ".java", ".rs"];
const MAX_FILE_SIZE = 200 * 1024; // skip files > 200KB
const MAX_SIGNATURES = 500;       // cap at 500 signatures to keep context small

function extractSignatures(filePath, content) {
  const signatures = [];

  // PHP: class, interface, trait, function, public/protected function
  const phpMatches = content.matchAll(
    /(?:abstract\s+)?(?:final\s+)?(?:class|interface|trait)\s+(\w+)/g
  );
  for (const m of phpMatches) signatures.push(`  ${m[0]}`);

  const phpMethods = content.matchAll(
    /(?:public|protected|private)\s+(?:static\s+)?function\s+(\w+)\s*\([^)]*\)/g
  );
  for (const m of phpMethods) signatures.push(`  ${m[0].trim()}`);

  // JS/TS: export function, export class, export const, export default
  const jsFuncs = content.matchAll(
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g
  );
  for (const m of jsFuncs) signatures.push(`  function ${m[1]}(...)`);

  const jsClasses = content.matchAll(/(?:export\s+)?class\s+(\w+)/g);
  for (const m of jsClasses) signatures.push(`  class ${m[1]}`);

  const jsExports = content.matchAll(/(?:export\s+)?const\s+(\w+)\s*=/g);
  for (const m of jsExports) signatures.push(`  const ${m[1]}`);

  const jsInterfaces = content.matchAll(/(?:export\s+)?interface\s+(\w+)/g);
  for (const m of jsInterfaces) signatures.push(`  interface ${m[1]}`);

  // Python: class, def
  const pyClasses = content.matchAll(/class\s+(\w+)/g);
  for (const m of pyClasses) signatures.push(`  class ${m[1]}`);
  const pyFuncs = content.matchAll(/def\s+(\w+)\s*\([^)]*\)/g);
  for (const m of pyFuncs) signatures.push(`  def ${m[1]}(...)`);

  // Ruby: class, module, def
  const rbClasses = content.matchAll(/(?:class|module)\s+(\w+)/g);
  for (const m of rbClasses) signatures.push(`  ${m[0]}`);
  const rbFuncs = content.matchAll(/def\s+(?:self\.)?(\w+)/g);
  for (const m of rbFuncs) signatures.push(`  def ${m[1]}`);

  return signatures;
}

function isTrackedByGit(filePath) {
  try {
    execSync(`git ls-files --error-unmatch "${filePath}"`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function buildFileIndex() {
  const index = {};
  let totalSignatures = 0;

  try {
    const allFiles = execSync("git ls-files")
      .toString()
      .split("\n")
      .filter(Boolean);

    for (const file of allFiles) {
      if (totalSignatures >= MAX_SIGNATURES) break;
      const ext = path.extname(file);
      if (!EXTS.includes(ext)) continue;

      try {
        const stat = fs.statSync(file);
        if (stat.size > MAX_FILE_SIZE) continue;

        const content = fs.readFileSync(file, "utf8");
        const signatures = extractSignatures(file, content);

        if (signatures.length > 0) {
          index[file] = signatures.slice(0, 20); // top 20 per file
          totalSignatures += signatures.length;
        }
      } catch (e) {}
    }
  } catch (e) {
    console.warn("Failed to build codebase index:", e.message);
  }

  return { index, total_signatures: totalSignatures };
}

// Git history: recent commit context for changed files
function buildGitContext(changedFiles) {
  try {
    // Last 5 commit messages on the PR branch
    const commits = execSync(
      `git log --oneline --no-merges -5 origin/${process.env.GITHUB_BASE_REF || "main"}..HEAD`
    ).toString().trim();

    // Most frequently changed files (churn indicators)
    const churn = execSync(
      `git log --format=format: --name-only -20 | sort | uniq -c | sort -nr | head -10`
    ).toString().trim();

    // Recent authors on these files
    const authors = execSync(
      `git shortlog -sn HEAD -10 -- ${changedFiles.join(" ")}`
    ).toString().trim();

    return {
      recent_commits: commits || "N/A",
      high_churn_files: churn || "N/A",
      recent_authors: authors || "N/A",
    };
  } catch (e) {
    return { recent_commits: "N/A", high_churn_files: "N/A", recent_authors: "N/A" };
  }
}

// Main
if (require.main === module) {
  const index = buildFileIndex();
  fs.writeFileSync("codebase-index.json", JSON.stringify(index, null, 2));

  // Extract changed files from diff.raw if available
  let changedFiles = [];
  try {
    const diff = fs.readFileSync("diff.raw", "utf8");
    const files = diff.split("FILE:").filter(Boolean);
    changedFiles = files.map((f) => f.split("\n")[0]?.trim()).filter(Boolean);
  } catch (e) {}

  const gitCtx = buildGitContext(changedFiles);
  fs.writeFileSync("git-context.json", JSON.stringify(gitCtx, null, 2));

  console.log(
    `✅ Codebase index: ${Object.keys(index.index).length} files, ${index.total_signatures} signatures`,
  );
  if (gitCtx.recent_commits !== "N/A") {
    console.log(`✅ Git context: ${gitCtx.recent_commits.split("\n").length} recent commits`);
  }
}

module.exports = { buildFileIndex, buildGitContext };

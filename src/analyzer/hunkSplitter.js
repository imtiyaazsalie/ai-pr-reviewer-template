const fs = require("fs");

const DEPTH_CONFIG = {
  quick: { contextLines: 5, maxChunkSize: 4000 },
  standard: { contextLines: 20, maxChunkSize: 8000 },
  thorough: { contextLines: 40, maxChunkSize: 12000 },
};

const depth = process.env.REVIEW_DEPTH || "standard";
const { contextLines: CONTEXT_LINES, maxChunkSize: MAX_CHUNK_SIZE } =
  DEPTH_CONFIG[depth] || DEPTH_CONFIG.standard;

function getSurroundingContext(filePath, hunkStartLine) {
  try {
    if (!fs.existsSync(filePath)) return "";
    const fileContent = fs.readFileSync(filePath, "utf8");
    const fileLines = fileContent.split("\n");
    const start = Math.max(0, hunkStartLine - CONTEXT_LINES - 1);
    const end = Math.min(fileLines.length, hunkStartLine + CONTEXT_LINES);
    const contextLines = fileLines.slice(start, end);
    const numbered = contextLines
      .map((line, i) => `${start + i + 1}: ${line}`)
      .join("\n");
    return `\n\n--- Surrounding code (lines ${start + 1}-${end}) ---\n${numbered}\n---`;
  } catch (e) {
    return "";
  }
}

// Extract cross-file references (imports, requires, includes)
function extractCrossRefs(filePath) {
  try {
    if (!fs.existsSync(filePath)) return "";
    const content = fs.readFileSync(filePath, "utf8");
    const references = [];

    // JS/TS imports
    const jsImports = content.matchAll(
      /(?:import|require)\s*\(?\s*['"]([^'"]+)['"]/g,
    );
    for (const m of jsImports) {
      const ref = resolveRefPath(filePath, m[1]);
      if (ref && ref !== filePath) references.push(ref);
    }

    // Python imports
    const pyImports = content.matchAll(/(?:from|import)\s+([\w.]+)/g);
    for (const m of pyImports) {
      const refPath = m[1].replace(/\./g, "/") + ".py";
      if (fs.existsSync(refPath)) references.push(refPath);
    }

    // Ruby requires
    const rubyRequires = content.matchAll(/require\s+['"]([^'"]+)['"]/g);
    for (const m of rubyRequires) {
      const ref = m[1] + ".rb";
      if (fs.existsSync(ref) && ref !== filePath) references.push(ref);
    }

    // PHP use/require
    const phpRequires = content.matchAll(
      /(?:use|require(?:_once)?|include(?:_once)?)\s+['"]?([^;'"\s]+)/g,
    );
    for (const m of phpRequires) {
      const ref = m[1] + ".php";
      if (fs.existsSync(ref) && ref !== filePath) references.push(ref);
    }

    if (!references.length) return "";

    // Read the public API of referenced files
    const refsInfo = [];
    for (const ref of [...new Set(references)].slice(0, 3)) {
      try {
        const refContent = fs.readFileSync(ref, "utf8");
        // Extract function signatures, class names, exports
        const signatures = [];
        const funcMatches = refContent.matchAll(
          /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g,
        );
        for (const fm of funcMatches)
          signatures.push(`  function ${fm[1]}(...)`);
        const classMatches = refContent.matchAll(
          /(?:export\s+)?class\s+(\w+)/g,
        );
        for (const cm of classMatches) signatures.push(`  class ${cm[1]}`);
        const constMatches = refContent.matchAll(
          /(?:export\s+)?const\s+(\w+)\s*=/g,
        );
        for (const km of constMatches) signatures.push(`  const ${km[1]}`);

        if (signatures.length) {
          refsInfo.push(
            `\n**${ref}** exports:\n${signatures.slice(0, 15).join("\n")}`,
          );
        }
      } catch (e) {}
    }

    return refsInfo.join("\n");
  } catch (e) {
    return "";
  }
}

function resolveRefPath(currentFile, importPath) {
  if (importPath.startsWith(".")) {
    const dir = require("path").dirname(currentFile);
    const resolved = require("path").resolve(dir, importPath);
    // Try common extensions
    for (const ext of [
      "",
      ".js",
      ".ts",
      ".jsx",
      ".tsx",
      ".mjs",
      "/index.js",
      "/index.ts",
    ]) {
      if (fs.existsSync(resolved + ext)) return resolved + ext;
    }
  }
  return null;
}

function parseHunkStartLine(hunkHeader) {
  // Format: @@ -oldStart,oldCount +newStart,newCount @@
  const match = hunkHeader.match(/\+(\d+)(?:,(\d+))?/);
  return match ? parseInt(match[1], 10) : 0;
}

const diff = fs.readFileSync("diff.raw", "utf8");
const files = diff.split("FILE:").filter(Boolean);
const chunks = [];

for (const f of files) {
  const lines = f.split("\n");
  const fileName = lines[0]?.trim() || "unknown";
  const content = lines.slice(1).join("\n");
  const hunks = content.match(/@@[\s\S]*?(?=@@|$)/g) || [content];

  for (const hunk of hunks) {
    const trimmed = hunk.trim();
    if (!trimmed) continue;

    const hunkHeader = trimmed.match(/^@@[^@]*@@/)?.[0] || "";
    const hunkStartLine = parseHunkStartLine(hunkHeader);

    let chunkContent = trimmed.slice(0, MAX_CHUNK_SIZE);

    // Add surrounding code context
    if (hunkStartLine > 0 && fileName !== "unknown") {
      const context = getSurroundingContext(fileName, hunkStartLine);
      if (context) {
        chunkContent = context + "\n--- Diff hunk ---\n" + chunkContent;
      }
    }

    // Add cross-file references
    let crossRefs = "";
    if (fileName !== "unknown") {
      crossRefs = extractCrossRefs(fileName);
    }

    chunks.push({
      file: fileName,
      content: chunkContent.slice(0, MAX_CHUNK_SIZE + 2000), // allow context overhead
      cross_refs: crossRefs || undefined,
    });
  }
}

fs.writeFileSync("chunks.json", JSON.stringify(chunks, null, 2));
console.log(
  `✅ Created ${chunks.length} chunks (with ±${CONTEXT_LINES} context lines)`,
);

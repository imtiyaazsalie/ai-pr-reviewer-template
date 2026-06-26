const fs = require("fs");

const DEPTH_CONFIG = {
  quick: { contextLines: 5, maxChunkSize: 4000 },
  standard: { contextLines: 20, maxChunkSize: 8000 },
  thorough: { contextLines: 40, maxChunkSize: 12000 },
};

const depth = process.env.REVIEW_DEPTH || "standard";
const { contextLines: CONTEXT_LINES, maxChunkSize: MAX_CHUNK_SIZE } =
  DEPTH_CONFIG[depth] || DEPTH_CONFIG.standard;

// Full file review thresholds (lines)
const FULL_FILE_MAX_LINES = 200; // small files: include everything
const SECTION_FILE_MAX_LINES = 500; // medium files: include header + diff sections

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

function extractCrossRefs(filePath) {
  try {
    if (!fs.existsSync(filePath)) return "";
    const content = fs.readFileSync(filePath, "utf8");
    const references = [];

    const jsImports = content.matchAll(
      /(?:import|require)\s*\(?\s*['"]([^'"]+)['"]/g,
    );
    for (const m of jsImports) {
      const ref = resolveRefPath(filePath, m[1]);
      if (ref && ref !== filePath) references.push(ref);
    }

    const pyImports = content.matchAll(/(?:from|import)\s+([\w.]+)/g);
    for (const m of pyImports) {
      const refPath = m[1].replace(/\./g, "/") + ".py";
      if (fs.existsSync(refPath)) references.push(refPath);
    }

    const rubyRequires = content.matchAll(/require\s+['"]([^'"]+)['"]/g);
    for (const m of rubyRequires) {
      const ref = m[1] + ".rb";
      if (fs.existsSync(ref) && ref !== filePath) references.push(ref);
    }

    const phpRequires = content.matchAll(
      /(?:use|require(?:_once)?|include(?:_once)?)\s+['"]?([^;'"\s]+)/g,
    );
    for (const m of phpRequires) {
      const ref = m[1] + ".php";
      if (fs.existsSync(ref) && ref !== filePath) references.push(ref);
    }

    if (!references.length) return "";

    const refsInfo = [];
    for (const ref of [...new Set(references)].slice(0, 3)) {
      try {
        const refContent = fs.readFileSync(ref, "utf8");
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
  const match = hunkHeader.match(/\+(\d+)(?:,(\d+))?/);
  return match ? parseInt(match[1], 10) : 0;
}

// Full file context: reads entire file, marks changed lines with [+]
function getFullFileContext(filePath, changedLines) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const fileContent = fs.readFileSync(filePath, "utf8");
    const fileLines = fileContent.split("\n");

    // Small files (≤ 200 lines): include complete file
    if (fileLines.length <= FULL_FILE_MAX_LINES) {
      const numbered = fileLines
        .map((line, i) => {
          const marker = changedLines.has(i + 1) ? " [+] " : "     ";
          return `${String(i + 1).padStart(4, " ")}:${marker}${line}`;
        })
        .join("\n");
      return {
        type: "full",
        content: `\n\n--- Full file (${fileLines.length} lines, changed lines marked [+]) ---\n${numbered}\n---\n\nReview ALL lines above — both changed and pre-existing code.`,
      };
    }

    // Medium files (201-500 lines): include header + diff sections
    if (fileLines.length <= SECTION_FILE_MAX_LINES) {
      const header = fileLines
        .slice(0, 50)
        .map((line, i) => `${String(i + 1).padStart(4, " ")}:${line}`)
        .join("\n");

      const sortedHunks = [...changedLines].sort((a, b) => a - b);
      const regions = [];
      for (const hunkLine of sortedHunks) {
        const s = Math.max(0, hunkLine - CONTEXT_LINES - 1);
        const e = Math.min(fileLines.length, hunkLine + CONTEXT_LINES);
        const region = fileLines
          .slice(s, e)
          .map((line, i) => {
            const ln = s + i + 1;
            const marker = changedLines.has(ln) ? " [+] " : "     ";
            return `${String(ln).padStart(4, " ")}:${marker}${line}`;
          })
          .join("\n");
        regions.push(`  [lines ${s + 1}-${e}]:\n${region}`);
      }

      return {
        type: "sections",
        content: [
          `\n\n--- File header (first 50 of ${fileLines.length} lines) ---`,
          header,
          "\n--- Changed sections (changed lines marked [+]) ---",
          ...regions,
          "---",
        ].join("\n"),
      };
    }

    // Large files (> 500 lines): no full file context (diff-only with surrounding lines)
    return null;
  } catch (e) {
    return null;
  }
}

// Extract changed line numbers from a diff hunk
function extractChangedLines(hunkText, hunkStartLine) {
  const changed = new Set();
  if (!hunkStartLine) return changed;
  const hunkBody = hunkText.replace(/^@@[^@]*@@\n?/m, "");
  let currentLine = hunkStartLine;
  for (const line of hunkBody.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++"))
      changed.add(currentLine++);
    else if (line.startsWith("-")) {
      /* skip removed lines */
    } else currentLine++; // context line
  }
  return changed;
}

// --- Main ---

const diff = fs.readFileSync("diff.raw", "utf8");
const files = diff.split("FILE:").filter(Boolean);
const chunks = [];

// Collect filenames for logging
const filenames = [];

for (const f of files) {
  const lines = f.split("\n");
  const fileName = lines[0]?.trim() || "unknown";
  filenames.push(fileName);
  const content = lines.slice(1).join("\n");
  const hunks = content.match(/@@[\s\S]*?(?=@@|$)/g) || [content];

  // Collect all changed line numbers for this file
  const allChangedLines = new Set();
  for (const hunk of hunks) {
    const hunkHeader = hunk.match(/^@@[^@]*@@/)?.[0] || "";
    const startLine = parseHunkStartLine(hunkHeader);
    extractChangedLines(hunk, startLine).forEach((l) => allChangedLines.add(l));
  }

  // Get full file context if file is small/medium
  const fullFileCtx = getFullFileContext(fileName, allChangedLines);
  const crossRefs = fileName !== "unknown" ? extractCrossRefs(fileName) : "";

  for (const hunk of hunks) {
    const trimmed = hunk.trim();
    if (!trimmed) continue;

    const hunkHeader = trimmed.match(/^@@[^@]*@@/)?.[0] || "";
    const hunkStartLine = parseHunkStartLine(hunkHeader);

    let chunkContent = "";

    // Build content based on file size
    if (fullFileCtx) {
      chunkContent = fullFileCtx.content;
      if (fullFileCtx.type === "sections") {
        const ctx = getSurroundingContext(fileName, hunkStartLine);
        if (ctx) chunkContent += "\n" + ctx;
      }
      chunkContent +=
        "\n--- Diff hunk ---\n" + trimmed.slice(0, MAX_CHUNK_SIZE);
    } else if (hunkStartLine > 0) {
      const ctx = getSurroundingContext(fileName, hunkStartLine);
      chunkContent =
        (ctx || "") +
        "\n--- Diff hunk ---\n" +
        trimmed.slice(0, MAX_CHUNK_SIZE);
    } else {
      chunkContent = trimmed.slice(0, MAX_CHUNK_SIZE);
    }

    chunks.push({
      file: fileName,
      content: chunkContent.slice(0, MAX_CHUNK_SIZE + 6000),
      cross_refs: crossRefs || undefined,
    });
  }
}

// PR Compression: when too many chunks, prioritize high-risk files
const MAX_CHUNKS = 30;
if (chunks.length > MAX_CHUNKS) {
  // Score each chunk's file for risk
  const riskScore = (fileName) => {
    let score = 1;
    if (
      fileName.includes("auth") ||
      fileName.includes("security") ||
      fileName.includes("crypto")
    )
      score = 5;
    else if (
      fileName.includes("config") ||
      fileName.includes("env") ||
      fileName.includes("db")
    )
      score = 4;
    else if (
      fileName.includes("test") ||
      fileName.includes("spec") ||
      fileName.includes("mock")
    )
      score = 1;
    else if (
      fileName.includes("controller") ||
      fileName.includes("service") ||
      fileName.includes("handler")
    )
      score = 3;
    else score = 2;
    return score;
  };

  // Sort: highest risk first, newest files first
  chunks.sort((a, b) => {
    const riskA = riskScore(a.file);
    const riskB = riskScore(b.file);
    if (riskB !== riskA) return riskB - riskA;
    return a.file.localeCompare(b.file);
  });

  // Keep top chunks, compress rest to file summaries
  const kept = chunks.slice(0, MAX_CHUNKS);
  const compressed = chunks.slice(MAX_CHUNKS);

  // Summarize compressed files
  const compressedFiles = [...new Set(compressed.map((c) => c.file))];
  if (compressedFiles.length > 0) {
    kept.push({
      file: "COMPRESSED",
      content: `The following ${compressedFiles.length} lower-priority files were compressed:\n${compressedFiles.map((f) => `- ${f}`).join("\n")}`,
      cross_refs: undefined,
    });
  }

  chunks.length = 0;
  chunks.push(...kept);
  console.log(
    `📦 PR compressed: ${kept.length} chunks kept, ${compressedFiles.length} files compressed`,
  );
}

// Log summary
let smallFileCount = 0;
let mediumFileCount = 0;
for (const fname of [...new Set(filenames)]) {
  try {
    if (fname !== "unknown" && fs.existsSync(fname)) {
      const len = fs.readFileSync(fname, "utf8").split("\n").length;
      if (len <= FULL_FILE_MAX_LINES) smallFileCount++;
      else if (len <= SECTION_FILE_MAX_LINES) mediumFileCount++;
    }
  } catch (e) {}
}

fs.writeFileSync("chunks.json", JSON.stringify(chunks, null, 2));
console.log(
  `✅ Created ${chunks.length} chunks` +
    ` (±${CONTEXT_LINES} context, ${smallFileCount} full-file${smallFileCount !== 1 ? "s" : ""}, ${mediumFileCount} sectioned)`,
);

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

    chunks.push({
      file: fileName,
      content: chunkContent.slice(0, MAX_CHUNK_SIZE + 2000), // allow context overhead
    });
  }
}

fs.writeFileSync("chunks.json", JSON.stringify(chunks, null, 2));
console.log(
  `✅ Created ${chunks.length} chunks (with ±${CONTEXT_LINES} context lines)`,
);

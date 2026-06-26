// Token-aware PR processing — pr-agent's key innovation
// Budgets tokens per file based on priority and limits

const config = require("../config/loader").load();

const CHARS_PER_TOKEN = 4; // approximate

function estimateTokens(text) {
  return Math.ceil((text || "").length / CHARS_PER_TOKEN);
}

function scoreFilePriority(filePath) {
  let score = 2;
  const lower = filePath.toLowerCase();
  if (lower.includes("auth") || lower.includes("security") || lower.includes("crypto")) score = 5;
  else if (lower.includes("config") || lower.includes("env") || lower.includes("db") || lower.includes(".lock")) score = 4;
  else if (lower.includes("controller") || lower.includes("service") || lower.includes("handler") || lower.includes("middleware")) score = 3;
  else if (lower.includes("test") || lower.includes("spec") || lower.includes("mock") || lower.includes("fixture")) score = 1;
  return score;
}

function budgetTokens(chunks, maxTokens) {
  const cfg = config.pr_processing;
  const fileMap = {};

  // Group chunks by file
  for (const chunk of chunks) {
    if (!fileMap[chunk.file]) fileMap[chunk.file] = [];
    fileMap[chunk.file].push(chunk);
  }

  // Score each file
  const files = Object.entries(fileMap).map(([file, fileChunks]) => ({
    file,
    chunks: fileChunks,
    priority: scoreFilePriority(file),
    totalTokens: fileChunks.reduce((sum, c) => sum + estimateTokens(c.content), 0),
  }));

  // Sort by priority (highest first)
  files.sort((a, b) => b.priority - a.priority || a.file.localeCompare(b.file));

  // Budget tokens per file based on priority
  let remaining = maxTokens;
  const result = [];
  const compressed = [];

  for (const file of files) {
    const budget = Math.min(
      cfg.max_tokens_per_file,
      Math.floor(remaining * (file.priority / files.reduce((s, f) => s + f.priority, 0)) * 2),
    );

    if (file.totalTokens <= budget || file.priority >= 4) {
      // Full review for high-priority or small files
      result.push(...file.chunks);
      remaining -= file.totalTokens;
    } else if (file.priority >= 2 && remaining > 2000) {
      // Partial review: include first chunk + summary
      const firstChunk = file.chunks[0];
      firstChunk.content = `[Compressed: ${file.file} (${file.chunks.length} hunks, priority ${file.priority})]\n` +
        (firstChunk.content || "").slice(0, budget);
      result.push(firstChunk);
      remaining -= estimateTokens(firstChunk.content);
    } else {
      compressed.push(file.file);
    }
  }

  if (compressed.length > 0) {
    console.log(`📦 Token budget: ${compressed.length} low-priority files compressed, ${result.length} chunks kept`);
  }

  return result;
}

module.exports = { estimateTokens, scoreFilePriority, budgetTokens };

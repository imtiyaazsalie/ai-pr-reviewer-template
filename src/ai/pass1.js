const fs = require("fs");
const { callLLM } = require("./client");
const { SYSTEM_PROMPT_PASS1 } = require("./prompts");
const pLimit = require("p-limit");

const DEPTH_CONFIG = {
  quick: { maxTokens: 600, temperature: 0.1, label: "quick" },
  standard: { maxTokens: 1500, temperature: 0.2, label: "standard" },
  thorough: { maxTokens: 2500, temperature: 0.3, label: "thorough" },
};

const depth = process.env.REVIEW_DEPTH || "standard";
const { maxTokens, temperature, label } =
  DEPTH_CONFIG[depth] || DEPTH_CONFIG.standard;

const limit = pLimit(parseInt(process.env.MAX_CONCURRENCY || "5", 10));

function loadPRContext() {
  try {
    return JSON.parse(fs.readFileSync("pr-context.json", "utf8"));
  } catch (e) {
    return null;
  }
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync("review-config.json", "utf8"));
  } catch (e) {
    return { rules: [], review: {} };
  }
}

function loadLearning() {
  try {
    const data = JSON.parse(fs.readFileSync(".ai-cache/learning.json", "utf8"));
    return data;
  } catch (e) {
    return { dismissed_patterns: [], suppressed_files: [] };
  }
}

function loadDeterministicSummary() {
  try {
    return JSON.parse(fs.readFileSync("deterministic-summary.json", "utf8"));
  } catch (e) {
    return null;
  }
}

function loadFileMeta() {
  try {
    return JSON.parse(fs.readFileSync("file-meta.json", "utf8"));
  } catch (e) {
    return {};
  }
}

function getInstructionsForFile(filePath, config) {
  const rule = (config.rules || []).find((r) =>
    filePath.startsWith(r.path || ""),
  );
  if (!rule) return "";
  return [
    `\n### Review instructions for this file`,
    rule.instructions ? `Instructions: ${rule.instructions}` : "",
    rule.ignore_style ? "Style/formatting: IGNORE" : "",
    rule.severity ? `Default severity: ${rule.severity}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

(async () => {
  const prContext = loadPRContext();
  const config = loadConfig();
  const fileMeta = loadFileMeta();
  const chunks = JSON.parse(fs.readFileSync("chunks.json", "utf8"));

  // Load codebase index for global context
  let codebaseIndex = { index: {}, total_signatures: 0 };
  try {
    codebaseIndex = JSON.parse(fs.readFileSync("codebase-index.json", "utf8"));
  } catch (e) {}

  // Build relevant codebase context for changed files
  const changedDirs = [
    ...new Set(
      chunks
        .map((c) => c.file.split("/").slice(0, -1).join("/"))
        .filter(Boolean),
    ),
  ];
  const relevantFiles = Object.entries(codebaseIndex.index || {})
    .filter(([f]) => changedDirs.some((d) => f.startsWith(d)))
    .slice(0, 15);
  const codebaseBlock =
    relevantFiles.length > 0
      ? `\n## Codebase context\n${relevantFiles.map(([f, sigs]) => `**${f}**:\n${sigs.slice(0, 10).join("\n")}`).join("\n\n")}`
      : "";

  const prContextBlock = prContext?.title
    ? [
        `## PR Context`,
        `Title: ${prContext.title}`,
        prContext.description
          ? `Description: ${prContext.description.slice(0, 2000)}`
          : "",
        `Files changed: ${prContext.files_changed} | +${prContext.additions} / -${prContext.deletions}`,
        `\nChanged files:`,
        prContext.files_list,
        `\n---`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const results = await Promise.all(
    chunks.map((chunk) =>
      limit(async () => {
        const meta = fileMeta[chunk.file] || {};
        const dirInstructions = getInstructionsForFile(chunk.file, config);

        // Only the essentials: what is this PR, what code exists nearby, here is the diff
        const userPrompt = [
          prContextBlock,
          codebaseBlock,
          chunk.cross_refs
            ? `\n## Cross-file references:\n${chunk.cross_refs}`
            : "",
          `## File: ${chunk.file}${meta.is_test ? " (test)" : ""}`,
          dirInstructions,
          `\n## Diff:`,
          chunk.content,
        ]
          .filter(Boolean)
          .join("\n");

        try {
          const response = await callLLM(
            [
              { role: "system", content: SYSTEM_PROMPT_PASS1 },
              { role: "user", content: userPrompt },
            ],
            temperature,
            maxTokens,
          );
          let issues = [];
          try {
            const parsed = JSON.parse(response);
            if (Array.isArray(parsed)) issues = parsed;
            else if (parsed.issues) issues = parsed.issues;
            else issues = [parsed];
          } catch (e) {
            const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
              try {
                issues = JSON.parse(jsonMatch[1]);
                if (!Array.isArray(issues)) issues = [issues];
              } catch (e2) {}
            } else {
              issues = [{ message: response, file: chunk.file }];
            }
          }
          return {
            file: chunk.file,
            issues: Array.isArray(issues) ? issues : [issues],
          };
        } catch (err) {
          console.error(`Error processing ${chunk.file}:`, err.message);
          return { file: chunk.file, issues: [] };
        }
      }),
    ),
  );

  fs.writeFileSync("pass1.json", JSON.stringify(results, null, 2));
  console.log(`✅ Pass 1 complete (${label}, ${maxTokens} tokens)`);
})();

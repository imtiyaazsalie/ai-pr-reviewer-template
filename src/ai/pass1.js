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
  const learning = loadLearning();
  const chunks = JSON.parse(fs.readFileSync("chunks.json", "utf8"));

  const linkedIssuesBlock = prContext?.linked_issues?.length
    ? `\n## Linked Issues\n${prContext.linked_issues.map((i) => `- #${i.number}: ${i.title} [${(i.labels || []).join(", ")}]`).join("\n")}`
    : "";

  const learningBlock = learning?.dismissed_patterns?.length
    ? `\n## Team Learning (previously dismissed patterns — do NOT re-flag these)\n${learning.dismissed_patterns.map((p) => `- File pattern: ${p.file_pattern || "*"}, Issue pattern: "${p.issue_pattern}"`).join("\n")}`
    : "";

  const suppressedForFile = (learning?.suppressed_files || []).filter((s) => {
    return chunks.some((c) =>
      c.file.match(new RegExp(s.file_pattern.replace(/\*/g, ".*"))),
    );
  });
  const suppressedBlock = suppressedForFile.length
    ? `\n## Previously Suppressed (these files had issues the team dismissed)\n${suppressedForFile.map((s) => `- ${s.file_pattern}: "${s.note}"`).join("\n")}`
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

        const userPrompt = [
          prContextBlock,
          linkedIssuesBlock,
          learningBlock,
          suppressedBlock,
          `## File: ${chunk.file}${meta.is_test ? " (test file — flag missing assertions, not helper structure)" : ""}`,
          dirInstructions,
          chunk.cross_refs
            ? `\n## Cross-file references (API contracts — flag breaking changes):\n${chunk.cross_refs}`
            : "",
          `\n## Diff hunk:`,
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

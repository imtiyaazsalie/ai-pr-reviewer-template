const fs = require("fs");
const { callLLM } = require("./client");
const { SYSTEM_PROMPT_PASS1 } = require("./prompts");
const pLimit = require("p-limit");

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
          `## File: ${chunk.file}${meta.is_test ? " (test file — flag missing assertions, not helper structure)" : ""}`,
          dirInstructions,
          `\n## Diff hunk:`,
          chunk.content,
        ]
          .filter(Boolean)
          .join("\n");

        try {
          const response = await callLLM([
            { role: "system", content: SYSTEM_PROMPT_PASS1 },
            { role: "user", content: userPrompt },
          ]);
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
  console.log("✅ Pass 1 complete");
})();

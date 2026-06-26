const fs = require("fs");
const { callLLM } = require("./client");
const { SYSTEM_PROMPT_PASS1 } = require("./prompts");
const pLimit = require("p-limit");

const limit = pLimit(parseInt(process.env.MAX_CONCURRENCY || "5", 10));

(async () => {
  const chunks = JSON.parse(fs.readFileSync("chunks.json", "utf8"));
  const results = await Promise.all(
    chunks.map((chunk) =>
      limit(async () => {
        const userPrompt = `File: ${chunk.file}\n\nDiff hunk:\n${chunk.content}`;
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

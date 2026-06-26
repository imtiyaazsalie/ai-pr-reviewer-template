const fs = require("fs");
const { callLLM } = require("./client");
const { SYSTEM_PROMPT_PASS2 } = require("./prompts");

const SELF_REFLECTION_PROMPT = `You are re-reading your own code review to check for errors and omissions.

## Your task
You just reviewed a diff and flagged some issues. Now re-read the review and:
1. Are there any issues you MISSED? Look at the diff again — did you skip anything important?
2. Are any of the flagged issues FALSE POSITIVES? Re-read the code — would removing this make the code worse?
3. Should any severity levels be adjusted? A warning that is actually a blocker? A blocker that is just a suggestion?

If you find missed issues, ADD them. If you find false positives, REMOVE them.
If you find severity mismatches, FIX them.

Return the FINAL corrected JSON array. Only valid JSON.`;

(async () => {
  const raw = JSON.parse(fs.readFileSync("pass1.json", "utf8"));
  const allIssues = raw.flatMap((item) =>
    (item.issues || []).map((issue) => ({
      ...issue,
      file: issue.file || item.file,
    })),
  );

  if (allIssues.length === 0) {
    fs.writeFileSync("final.review.json", JSON.stringify([], null, 2));
    console.log("✅ No issues to validate");
    return;
  }

  // Step 1: Validate & dedup existing findings (fast pass)
  let validated = allIssues;

  // Only run LLM validation if there are enough issues to justify it
  if (allIssues.length >= 3) {
    try {
      const inputText = JSON.stringify(allIssues, null, 2);
      const response = await callLLM(
        [
          { role: "system", content: SYSTEM_PROMPT_PASS2 },
          {
            role: "user",
            content: `Validate and deduplicate these issues:\n\n${inputText}`,
          },
        ],
        0.1,
        1500,
      );

      try {
        const parsed = JSON.parse(response);
        if (Array.isArray(parsed)) validated = parsed;
        else if (parsed.issues) validated = parsed.issues;
        else validated = allIssues;
      } catch (e) {
        // Try extracting from code block
        const match = response.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            validated = Array.isArray(parsed) ? parsed : allIssues;
          } catch (e2) {}
        }
      }
    } catch (err) {
      console.warn("Pass 2 validation failed, using raw:", err.message);
    }
  }

  // Step 2: Self-reflection — re-read the diff and check for missed issues
  let diffSample = "";
  try {
    diffSample = fs.readFileSync("diff.raw", "utf8").slice(0, 4000);
  } catch (e) {}

  if (diffSample && validated.length < 10) {
    try {
      const selfCheckInput = [
        "## Original review findings:",
        JSON.stringify(validated, null, 2),
        "\n## Original diff (re-read to check for missed issues):",
        diffSample,
        "\n## Instructions",
        "Check: did the reviewer miss anything? Were any issues wrongly flagged?",
        "Return the FINAL corrected JSON array. Add missed issues. Remove false positives.",
      ].join("\n");

      const reflection = await callLLM(
        [
          { role: "system", content: SELF_REFLECTION_PROMPT },
          { role: "user", content: selfCheckInput },
        ],
        0.2,
        2000,
      );

      try {
        const parsed = JSON.parse(reflection);
        if (Array.isArray(parsed)) validated = parsed;
      } catch (e) {
        const match = reflection.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed)) validated = parsed;
          } catch (e2) {}
        }
      }

      if (validated.length !== allIssues.length) {
        console.log(
          `🔍 Self-reflection: ${allIssues.length} → ${validated.length} issues (${validated.length > allIssues.length ? "added" : "removed"})`,
        );
      }
    } catch (err) {
      console.warn("Self-reflection failed, using validated:", err.message);
    }
  }

  fs.writeFileSync("final.review.json", JSON.stringify(validated, null, 2));
  console.log(`✅ Pass 2 complete: ${validated.length} validated issues`);
})();

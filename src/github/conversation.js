const { Octokit } = require("@octokit/rest");
const { callLLM } = require("../ai/client");

const CONVERSATION_PROMPT = `You are an AI code reviewer responding to a question about a pull request.

A user has @mentioned you with a question. They may be asking you to:
- Explain a specific piece of code
- Clarify why you flagged something
- Re-review a section they've updated
- Suggest an alternative approach

## Context
You will receive:
1. The PR title and description
2. The user's question
3. The current diff (if available)

## Rules
- Be concise but thorough — answer the question directly
- If you're being asked to review something, look for bugs, security issues, and logic errors
- If the user is challenging a review, explain your reasoning or concede if they're right
- Use code blocks for examples
- Keep responses under 500 words
- If you need more context to answer, say so politely

Do NOT use JSON format for responses — this is a conversational reply. Just answer naturally in markdown.`;

async function getPRContext(octokit, owner, repo, pullNumber) {
  try {
    const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: pullNumber });
    const { data: files } = await octokit.pulls.listFiles({ owner, repo, pull_number: pullNumber, per_page: 100 });
    return {
      title: pr.title,
      description: pr.body,
      files: files.map((f) => `${f.status}: ${f.filename}`).join("\n"),
    };
  } catch (e) {
    return { title: "Unknown", description: "", files: "" };
  }
}

(async () => {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
  const pullNumber = parseInt(process.env.PR_NUMBER, 10);
  const commentBody = process.env.COMMENT_BODY || "";

  if (!pullNumber || !commentBody) {
    console.error("Missing PR_NUMBER or COMMENT_BODY");
    process.exit(1);
  }

  // Strip the @ai-reviewer mention to get the actual question
  const question = commentBody.replace(/@ai-reviewer\b/gi, "").trim();

  if (!question) {
    console.log("No question after @mention, skipping");
    return;
  }

  const prContext = await getPRContext(octokit, owner, repo, pullNumber);

  const prompt = [
    `## PR\nTitle: ${prContext.title}`,
    prContext.description ? `Description: ${prContext.description.slice(0, 1500)}` : "",
    `\nFiles:\n${prContext.files}`,
    `\n## Question\n${question}`,
  ].filter(Boolean).join("\n");

  try {
    const reply = await callLLM(
      [
        { role: "system", content: CONVERSATION_PROMPT },
        { role: "user", content: prompt },
      ],
      0.3,
      1000,
    );

    const body = `🤖 ${reply}\n\n<sub>Reply generated automatically. Mention @ai-reviewer to ask follow-ups.</sub>`;

    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
    console.log("✅ Reply posted");
  } catch (err) {
    console.error("Failed to reply:", err.message);
  }
})();

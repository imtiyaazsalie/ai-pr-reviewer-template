const fs = require('fs');
const { callLLM } = require('./client');
const { SYSTEM_PROMPT_PASS2 } = require('./prompts');

(async () => {
  const raw = JSON.parse(fs.readFileSync('pass1.json', 'utf8'));
  const allIssues = raw.flatMap(item =>
    (item.issues || []).map(issue => ({
      ...issue,
      file: issue.file || item.file
    }))
  );

  if (allIssues.length === 0) {
    fs.writeFileSync('final.review.json', JSON.stringify([], null, 2));
    console.log('✅ No issues found');
    return;
  }

  const inputText = JSON.stringify(allIssues, null, 2);
  const userPrompt = `Here is a list of detected issues from the PR. Please validate and deduplicate them:\n\n${inputText}`;

  try {
    const response = await callLLM([
      { role: 'system', content: SYSTEM_PROMPT_PASS2 },
      { role: 'user', content: userPrompt }
    ]);
    let validated = [];
    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) validated = parsed;
      else if (parsed.issues) validated = parsed.issues;
      else validated = [parsed];
    } catch (e) {
      validated = allIssues;
    }
    fs.writeFileSync('final.review.json', JSON.stringify(validated, null, 2));
    console.log(`✅ Pass 2 complete: ${validated.length} issues`);
  } catch (err) {
    console.error('Pass 2 failed, using raw:', err.message);
    fs.writeFileSync('final.review.json', JSON.stringify(allIssues, null, 2));
  }
})();

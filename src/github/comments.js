const fs = require('fs');
const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const pullNumber = process.env.GITHUB_REF?.replace('refs/pull/', '').replace('/merge', '');

if (!pullNumber) process.exit(1);

(async () => {
  const risk = JSON.parse(fs.readFileSync('risk.json', 'utf8'));
  const issues = JSON.parse(fs.readFileSync('final.review.json', 'utf8'));

  let issueList = issues.length === 0 ? '✅ No critical issues found.' :
    issues.map(i => `- **${i.severity || 'info'}** (${i.file || 'unknown'}#L${i.line || '?'}): ${i.message}`).join('\n');

  const body = `
## 🤖 AI Code Review Summary

**Risk Level**: ${risk.level} (score: ${risk.score})

### Issues Detected
${issueList}

---
*Generated automatically using DeepSeek AI.*
`;

  try {
    await octokit.issues.createComment({ owner, repo, issue_number: parseInt(pullNumber, 10), body });
    console.log('✅ Summary posted');
  } catch (err) {
    console.error('Failed to post summary:', err.message);
  }
})();

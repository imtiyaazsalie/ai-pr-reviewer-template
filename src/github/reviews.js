const fs = require('fs');
const { Octokit } = require('@octokit/rest');
const { mapToLines } = require('../mapping/lineMapper');

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const pullNumber = process.env.GITHUB_REF?.replace('refs/pull/', '').replace('/merge', '');

if (!pullNumber) {
  console.error('GITHUB_REF missing');
  process.exit(1);
}

(async () => {
  const finalReview = JSON.parse(fs.readFileSync('final.review.json', 'utf8'));
  if (!finalReview.length) {
    console.log('No issues to comment');
    return;
  }

  const diffRaw = fs.readFileSync('diff.raw', 'utf8');
  const fileSections = diffRaw.split('FILE:').filter(Boolean);

  for (const issue of finalReview) {
    const targetFile = issue.file;
    const fileSection = fileSections.find(s => s.trim().startsWith(targetFile));
    if (!fileSection) {
      console.warn(`No diff for ${targetFile}`);
      continue;
    }
    const lineMap = mapToLines(fileSection);
    let lineNumber = issue.line;
    if (!lineNumber) {
      const content = issue.message?.substring(0, 30);
      if (content) {
        const match = Object.entries(lineMap).find(([_, text]) => text.includes(content));
        if (match) lineNumber = parseInt(match[0], 10);
      }
    }
    if (!lineNumber || !lineMap[lineNumber]) {
      console.warn(`Cannot map line for ${targetFile}`);
      continue;
    }

    try {
      await octokit.pulls.createReviewComment({
        owner, repo,
        pull_number: parseInt(pullNumber, 10),
        body: issue.message,
        path: targetFile,
        line: lineNumber,
        side: 'RIGHT'
      });
      console.log(`✅ Comment on ${targetFile}#L${lineNumber}`);
    } catch (err) {
      console.error(`Failed: ${err.message}`);
    }
  }
})();

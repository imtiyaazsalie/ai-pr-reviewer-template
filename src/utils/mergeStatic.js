const fs = require('fs');

let externalIssues = [];
try {
  const semgrep = JSON.parse(fs.readFileSync('semgrep-results.json', 'utf8'));
  externalIssues = semgrep.results?.map(r => ({
    file: r.path,
    line: r.start?.line,
    severity: r.extra?.severity === 'ERROR' ? 'blocker' : 'warning',
    message: r.extra?.message || r.check_id,
    source: 'semgrep'
  })) || [];
} catch (e) { /* ignore */ }

if (externalIssues.length) {
  const aiIssues = JSON.parse(fs.readFileSync('final.review.json', 'utf8'));
  const all = [...aiIssues, ...externalIssues];
  const seen = new Set();
  const merged = all.filter(item => {
    const key = `${item.file}|${item.line}|${item.message.substring(0, 20)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  fs.writeFileSync('final.review.json', JSON.stringify(merged, null, 2));
  console.log(`✅ Merged ${externalIssues.length} static analysis issues`);
}

const fs = require('fs');
const diff = fs.readFileSync('diff.raw', 'utf8');
const files = diff.split('FILE:').filter(Boolean);
const chunks = [];

for (const f of files) {
  const lines = f.split('\n');
  const fileName = lines[0]?.trim() || 'unknown';
  const content = lines.slice(1).join('\n');
  const hunks = content.match(/@@[\s\S]*?(?=@@|$)/g) || [content];

  for (const hunk of hunks) {
    const trimmed = hunk.trim();
    if (!trimmed) continue;
    chunks.push({
      file: fileName,
      content: trimmed.slice(0, 8000)
    });
  }
}

fs.writeFileSync('chunks.json', JSON.stringify(chunks, null, 2));
console.log(`✅ Created ${chunks.length} chunks`);

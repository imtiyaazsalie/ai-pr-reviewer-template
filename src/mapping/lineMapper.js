function mapToLines(diffContent) {
  const lines = diffContent.split('\n');
  const map = {};
  let newLineOffset = 0;
  let insideHunk = false;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/\+(\d+)(?:,(\d+))?/);
      if (match) {
        newLineOffset = parseInt(match[1], 10) - 1;
        insideHunk = true;
      }
      continue;
    }
    if (!insideHunk) continue;

    if (line.startsWith(' ')) {
      newLineOffset++;
      continue;
    }
    if (line.startsWith('+')) {
      newLineOffset++;
      map[newLineOffset] = line.substring(1);
      continue;
    }
  }
  return map;
}

module.exports = { mapToLines };

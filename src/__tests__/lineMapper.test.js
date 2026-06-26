const { mapToLines } = require('../mapping/lineMapper');

describe('mapToLines', () => {
  test('parses a simple diff hunk', () => {
    const diff = `@@ -1,0 +1,3 @@
+const x = 1;
+const y = 2;
+const z = 3;`;

    const result = mapToLines(diff);
    expect(result).toEqual({
      1: 'const x = 1;',
      2: 'const y = 2;',
      3: 'const z = 3;',
    });
  });

  test('handles lines with just + prefix', () => {
    const diff = '@@ -5,4 +5,5 @@\n unchanged context line\n+new line here\n unchanged again';
    const result = mapToLines(diff);
    // unchanged lines (prefix ' ') don't appear in the map
    // the offset starts at 5, then the first '+' adds line 6
    expect(result).toEqual({
      6: 'new line here',
    });
  });

  test('returns empty map for diff with no additions', () => {
    const diff = '@@ -1,3 +1,2 @@\n-removed line\n-removed line 2';
    const result = mapToLines(diff);
    expect(result).toEqual({});
  });

  test('handles multiple hunks', () => {
    const diff = `@@ -1,0 +1,2 @@
+line one
+line two
@@ -5,0 +8,1 @@
+line three`;

    const result = mapToLines(diff);
    expect(result).toEqual({
      1: 'line one',
      2: 'line two',
      8: 'line three',
    });
  });

  test('skips context lines (prefix space)', () => {
    const diff = '@@ -1,2 +1,4 @@\n context a\n+new a\n context b\n+new b';
    const result = mapToLines(diff);
    expect(result).toEqual({
      2: 'new a',
      4: 'new b',
    });
  });

  test('handles empty input gracefully', () => {
    const result = mapToLines('');
    expect(result).toEqual({});
  });
});

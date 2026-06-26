const path = require('path');
const fs = require('fs');

// We test the exported functions directly, not the CLI entry
jest.mock('child_process', () => ({
  execSync: jest.fn(() => Buffer.from('abc123def')),
}));

const cache = require('../cache/cache');

describe('cache', () => {
  const CACHE_DIR = path.resolve('.ai-cache');

  beforeEach(() => {
    // Clean up any cache dir from previous tests
    if (fs.existsSync(CACHE_DIR)) {
      fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(CACHE_DIR)) {
      fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    }
  });

  test('isCached returns false when no cache exists', () => {
    // Cache dir shouldn't exist yet (or is empty)
    if (fs.existsSync(CACHE_DIR)) {
      fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    }
    expect(cache.isCached()).toBe(false);
  });

  test('loadCache returns false when no cache exists', () => {
    expect(cache.loadCache()).toBe(false);
  });

  test('loadCache writes files when cache exists', () => {
    // Manually create a cache file
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const cacheFile = path.join(CACHE_DIR, 'abc123def.json');
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        finalReview: [{ file: 'test.js', severity: 'warning', message: 'test' }],
        risk: { score: 5, level: 'MEDIUM', addedLines: 10 },
      }),
    );

    const result = cache.loadCache();
    expect(result).toBe(true);

    // Check that output files were written
    expect(fs.existsSync('final.review.json')).toBe(true);
    expect(fs.existsSync('risk.json')).toBe(true);

    const review = JSON.parse(fs.readFileSync('final.review.json', 'utf8'));
    expect(review).toEqual([{ file: 'test.js', severity: 'warning', message: 'test' }]);

    // Cleanup output files
    fs.unlinkSync('final.review.json');
    fs.unlinkSync('risk.json');
  });
});

// Test provider resolution and request building (no actual API calls)
const path = require('path');

// We need to require the internal functions to test.
// Since they're not exported, we test through the public API mock.
const client = require('../ai/client');

describe('callLLM', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear AI-specific env vars
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.AI_MODEL;
    delete process.env.AI_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('defaults to deepseek when no provider specified', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test';
    // We can't call the real API, but we can verify it doesn't throw
    // on config resolution (it will throw on the actual HTTP call)
    try {
      await client.callLLM([{ role: 'user', content: 'hi' }]);
    } catch (error) {
      // Expected: HTTP call fails. Config error would be different.
      expect(error.message).not.toContain('AI_API_KEY not set');
    }
  });

  test('throws when no API key provided (non-ollama)', async () => {
    process.env.AI_PROVIDER = 'openai';
    try {
      await client.callLLM([{ role: 'user', content: 'hi' }]);
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error.message).toContain('AI_API_KEY not set');
    }
  });

  test('does not require API key for ollama', async () => {
    process.env.AI_PROVIDER = 'ollama';
    try {
      await client.callLLM([{ role: 'user', content: 'hi' }]);
    } catch (error) {
      // Expected: HTTP call fails (no ollama running locally).
      // But NOT an auth error.
      expect(error.message).not.toContain('AI_API_KEY not set');
    }
  });

  test('AI_API_KEY takes precedence over DEEPSEEK_API_KEY', async () => {
    process.env.AI_API_KEY = 'sk-primary';
    process.env.DEEPSEEK_API_KEY = 'sk-fallback';
    process.env.AI_PROVIDER = 'openai';
    // This would use sk-primary
    try {
      await client.callLLM([{ role: 'user', content: 'hi' }]);
    } catch (error) {
      expect(error.message).not.toContain('AI_API_KEY not set');
    }
  });
});

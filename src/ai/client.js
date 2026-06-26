const axios = require('axios');

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';
const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000;

async function callLLM(messages, temperature = 0.2) {
  let attempt = 0;
  let delay = INITIAL_DELAY;

  while (attempt < MAX_RETRIES) {
    try {
      const response = await axios.post(
        DEEPSEEK_API_URL,
        { model: MODEL, messages, temperature, max_tokens: 1500 },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`
          },
          timeout: 30000
        }
      );
      return response.data.choices[0].message.content;
    } catch (error) {
      attempt++;
      if (attempt === MAX_RETRIES) throw error;
      const isRetryable = error.response?.status === 429 || error.response?.status >= 500;
      if (!isRetryable) throw error;
      console.warn(`Attempt ${attempt} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

module.exports = { callLLM };

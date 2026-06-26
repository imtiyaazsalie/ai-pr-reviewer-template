const fs = require("fs");
const yaml = require("js-yaml");

const DEFAULTS = {
  tools: {
    review: { enabled: true, publish_output: true, num_max_findings: 15, inline_comments: true, persistent_comment: true, require_score: true, require_security_review: true, require_estimate_effort: true, extra_instructions: "" },
    describe: { enabled: true, publish_description_as_comment: true, add_pr_summary: true, extra_instructions: "" },
    improve: { enabled: true, num_code_suggestions: 5, inline_suggestions: true, extra_instructions: "" },
    ask: { enabled: true, max_questions: 3 },
  },
  pr_processing: {
    max_files_to_review: 30,
    max_tokens_per_file: 8000,
    prioritize_security_files: true,
    skip_generated_files: true,
    skip_asset_files: true,
    context_lines: 20,
  },
  ai: { model: "deepseek-chat", temperature: 0.2, max_tokens: 1500, fallback_models: [] },
  deterministic: { megalinter: true, trivy: true, osv_scanner: true, semgrep: false },
  output: { persistent_comment: true, auto_label: true, show_review_effort: true, show_relevant_config: false },
};

let config = null;

function load(configPath) {
  if (config) return config;

  config = { ...DEFAULTS };

  // Try loading user config
  const paths = [configPath, ".pr-reviewer.yml", ".github/pr-reviewer.yml", "config/pr-reviewer.yml"].filter(Boolean);
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const user = yaml.load(fs.readFileSync(p, "utf8"));
        config = deepMerge(config, user);
        console.log(`📋 Loaded config: ${p}`);
        break;
      }
    } catch (e) {}
  }

  return config;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

module.exports = { load, DEFAULTS };

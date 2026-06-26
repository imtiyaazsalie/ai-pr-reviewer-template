const { execSync } = require("child_process");
const fs = require("fs");
const yaml = require("js-yaml");

const base = process.env.GITHUB_BASE_REF || "main";
try {
  execSync(`git fetch origin ${base}`);
} catch (e) {
  console.warn("Failed to fetch base branch, using local HEAD");
}

let files = execSync(`git diff --name-only origin/${base}...HEAD`)
  .toString()
  .split("\n")
  .filter(Boolean);

let config = { workspaces: [], ignore: [] };
const configPath = process.env.CONFIG_PATH || "config/monorepo.yml";
try {
  const raw = fs.readFileSync(configPath, "utf8");
  config = yaml.load(raw);
} catch (e) {
  /* no config */
}

const filtered = files.filter((f) => {
  if (
    config.ignore &&
    config.ignore.some((pattern) =>
      f.match(new RegExp(pattern.replace("*", ".*"))),
    )
  ) {
    return false;
  }
  if (config.workspaces && config.workspaces.length) {
    return config.workspaces.some((ws) => f.startsWith(ws.replace("*", "")));
  }
  return (
    !f.includes("lock") &&
    !f.includes("dist") &&
    !f.includes("node_modules") &&
    !f.includes(".md")
  );
});

let diff = "";
for (const file of filtered) {
  diff += `\nFILE: ${file}\n`;
  diff += execSync(`git diff origin/${base}...HEAD -- ${file}`).toString();
}

fs.writeFileSync("diff.raw", diff);
console.log(`✅ Diff saved, ${filtered.length} files`);

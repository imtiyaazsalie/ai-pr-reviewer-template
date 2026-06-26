const fs = require("fs");

const results = {
  semgrep: [],
  trivy: [],
  osv: [],
  total: 0,
  sources: [],
  megalinter: [],
};

// --- Parse Semgrep ---
try {
  const semgrep = JSON.parse(fs.readFileSync("semgrep-results.json", "utf8"));
  results.semgrep = (semgrep.results || []).map((r) => ({
    file: r.path,
    line: r.start?.line,
    severity: r.extra?.severity === "ERROR" ? "blocker" : "warning",
    message: r.extra?.message || r.check_id,
    source: "semgrep",
    category: "static_analysis",
  }));
  if (results.semgrep.length) results.sources.push("semgrep");
} catch (e) {}

// --- Parse MegaLinter (SARIF) ---
try {
  const allSarifFiles = [];
  const reportsDir = "megalinter-reports";
  if (fs.existsSync(reportsDir)) {
    const dirFiles = fs
      .readdirSync(reportsDir)
      .filter((f) => f.endsWith(".sarif"))
      .map((f) => `${reportsDir}/${f}`);
    allSarifFiles.push(...dirFiles);
  }
  const rootSarif = fs.readdirSync(".").filter((f) => f.endsWith(".sarif"));
  allSarifFiles.push(...rootSarif);
  for (const sarifFile of [...new Set(allSarifFiles)].slice(0, 5)) {
    try {
      const sarif = JSON.parse(fs.readFileSync(sarifFile, "utf8"));
      for (const run of sarif.runs || []) {
        const toolName = run.tool?.driver?.name || "megalinter";
        for (const result of run.results || []) {
          const location = result.locations?.[0]?.physicalLocation;
          results.megalinter.push({
            file: location?.artifactLocation?.uri || "unknown",
            line: location?.region?.startLine,
            severity: result.level === "error" ? "warning" : "suggestion",
            message:
              `${toolName}: ${result.ruleId || ""} — ${result.message?.text || ""}`.slice(
                0,
                200,
              ),
            source: "megalinter",
            category: "code_quality",
          });
        }
      }
    } catch (e) {}
  }
  if (results.megalinter.length) results.sources.push("megalinter");
} catch (e) {}

// --- Parse Trivy ---
try {
  const trivy = JSON.parse(fs.readFileSync("trivy-results.json", "utf8"));
  const trivyIssues = [];

  // Secret findings
  if (trivy.Results) {
    for (const result of trivy.Results) {
      for (const secret of result.Secrets || []) {
        trivyIssues.push({
          file: result.Target,
          line: secret.StartLine,
          severity:
            secret.Severity === "CRITICAL" || secret.Severity === "HIGH"
              ? "blocker"
              : "warning",
          message: `Secret detected: ${secret.Title || secret.RuleID}`,
          source: "trivy",
          category: "secret",
        });
      }
      // Vulnerability findings
      for (const vuln of result.Vulnerabilities || []) {
        trivyIssues.push({
          file: result.Target,
          line: null,
          severity:
            vuln.Severity === "CRITICAL" || vuln.Severity === "HIGH"
              ? "blocker"
              : "warning",
          message: `${vuln.PkgName}@${vuln.InstalledVersion}: ${vuln.Title || vuln.VulnerabilityID} (${vuln.Severity})`,
          source: "trivy",
          category: "dependency",
        });
      }
      // Misconfig findings
      for (const mcfg of result.Misconfigurations || []) {
        trivyIssues.push({
          file: result.Target,
          line: mcfg.CauseMetadata?.StartLine,
          severity:
            mcfg.Severity === "CRITICAL" || mcfg.Severity === "HIGH"
              ? "blocker"
              : "warning",
          message:
            `Misconfiguration: ${mcfg.Title || mcfg.ID} — ${mcfg.Description || ""}`.slice(
              0,
              200,
            ),
          source: "trivy",
          category: "infra",
        });
      }
    }
  }
  results.trivy = trivyIssues;
  if (results.trivy.length) results.sources.push("trivy");
} catch (e) {}

// --- Parse OSV-Scanner ---
try {
  const osv = JSON.parse(fs.readFileSync("osv-results.json", "utf8"));
  const osvIssues = [];
  for (const result of osv.results || []) {
    for (const pkg of result.packages || []) {
      for (const vuln of pkg.vulnerabilities || []) {
        osvIssues.push({
          file: pkg.package?.name || "dependency",
          line: null,
          severity:
            vuln.severity?.[0]?.score === "CRITICAL" ||
            vuln.severity?.[0]?.score === "HIGH"
              ? "blocker"
              : "warning",
          message: `${pkg.package?.name || "unknown"}@${pkg.package?.version || "?"}: ${vuln.id} — ${(vuln.summary || "").slice(0, 100)}`,
          source: "osv-scanner",
          category: "dependency",
        });
      }
    }
  }
  results.osv = osvIssues;
  if (results.osv.length) results.sources.push("osv-scanner");
} catch (e) {}

// --- Merge all deterministic issues ---
const allIssues = [
  ...results.semgrep,
  ...results.megalinter,
  ...results.trivy,
  ...results.osv,
];
const seen = new Set();
const deduped = allIssues.filter((item) => {
  const key = `${item.file}|${item.line}|${item.source}|${item.message.slice(0, 40)}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

results.deterministic = deduped;
results.total = deduped.length;

// --- Merge with AI issues if available ---
try {
  const aiIssues = JSON.parse(fs.readFileSync("final.review.json", "utf8"));
  const merged = [
    ...aiIssues,
    ...deduped.map((d) => ({ ...d, confidence: 1.0 })),
  ];
  fs.writeFileSync("final.review.json", JSON.stringify(merged, null, 2));
  console.log(`✅ Merged ${deduped.length} deterministic issues into review`);
} catch (e) {}

// --- Save deterministic summary for AI prompt ---
const summary = {
  sources: results.sources,
  total_issues: deduped.length,
  categories: {
    code_quality: deduped.filter((d) => d.category === "code_quality").length,
    secrets: deduped.filter((d) => d.category === "secret").length,
    static_analysis: deduped.filter((d) => d.category === "static_analysis")
      .length,
    dependency: deduped.filter((d) => d.category === "dependency").length,
    infra: deduped.filter((d) => d.category === "infra").length,
  },
  top_issues: deduped.slice(0, 10).map((d) => ({
    file: d.file,
    line: d.line,
    message: d.message.slice(0, 120),
    category: d.category,
    source: d.source,
  })),
};

fs.writeFileSync(
  "deterministic-summary.json",
  JSON.stringify(summary, null, 2),
);
console.log(
  `📊 Deterministic pipeline: ${results.sources.join(" + ")} → ${deduped.length} issues ` +
    `(quality: ${summary.categories.code_quality}, secrets: ${summary.categories.secrets}, static: ${summary.categories.static_analysis}, ` +
    `deps: ${summary.categories.dependency}, infra: ${summary.categories.infra})`,
);

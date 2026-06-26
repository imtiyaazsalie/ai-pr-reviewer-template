const { computeRiskScore } = require("../scoring/risk");

describe("computeRiskScore", () => {
  test("returns LOW with zero issues and small diff", () => {
    const result = computeRiskScore([], "+one line\n+two lines\n");
    expect(result.level).toBe("LOW");
    expect(result.score).toBe(0);
  });

  test("single blocker is worth 5 points", () => {
    // Add 100+ lines to ensure no addedLines bonus
    const lines = Array(101).fill("+line").join("\n");
    const result = computeRiskScore(
      [{ severity: "blocker", file: "src/index.js", message: "bug" }],
      lines,
    );
    // score = 5 (blocker) + 1 (101/100 floor)
    expect(result.score).toBe(6);
    expect(result.level).toBe("MEDIUM");
  });

  test("single warning is worth 2 points", () => {
    const result = computeRiskScore(
      [{ severity: "warning", file: "src/index.js", message: "issue" }],
      "",
    );
    expect(result.score).toBe(2);
    expect(result.level).toBe("LOW");
  });

  test("single suggestion is worth 1 point", () => {
    const result = computeRiskScore(
      [{ severity: "suggestion", file: "src/index.js", message: "nit" }],
      "",
    );
    expect(result.score).toBe(1);
  });

  test("critical files (core, auth) double the score", () => {
    const result = computeRiskScore(
      [{ severity: "blocker", file: "src/core/database.js", message: "bug" }],
      "",
    );
    // 5 * 2 (core path) = 10
    expect(result.score).toBe(10);
    expect(result.level).toBe("MEDIUM");
  });

  test("HIGH risk with multiple blockers and large diff", () => {
    const lines = Array(300).fill("+line").join("\n");
    const result = computeRiskScore(
      [
        { severity: "blocker", file: "src/auth/login.js", message: "x" },
        { severity: "blocker", file: "src/core/api.js", message: "x" },
      ],
      lines,
    );
    // (5*2) + (5*2) + floor(299/100) = 10 + 10 + 2 = 22 -> HIGH
    expect(result.score).toBe(22);
    expect(result.level).toBe("HIGH");
  });

  test("added lines contribute 1 per 100 lines", () => {
    const result = computeRiskScore([], "+line\n+line\n");
    expect(result.score).toBe(0);
    expect(result.addedLines).toBe(1);
  });

  test("unknown severity defaults to 1 point", () => {
    const result = computeRiskScore(
      [{ severity: "critical", file: "src/test.js", message: "x" }],
      "",
    );
    expect(result.score).toBe(1);
  });
});

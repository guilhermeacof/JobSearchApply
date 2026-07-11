import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

describe("validação de flags do vagas-search", () => {
  test("sem comando imprime a ajuda e sai com código 1", async () => {
    const result = await runCLI([]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("USAGE");
  });

  test("search sem --query sai com código 1 e erro JSON no stderr", async () => {
    const result = await runCLI(["search"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("NO_QUERY");
  });

  test("comando desconhecido sai com código 1 e erro JSON no stderr", async () => {
    const result = await runCLI(["frobnicate"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("BAD_CMD");
  });

  test("--limit não numérico sai com código 1 e erro JSON no stderr", async () => {
    const result = await runCLI(["search", "-q", "qa", "--limit", "abc"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("BAD_ARG");
  });

  test("detail com id não interpretável sai com código 1", async () => {
    const result = await runCLI(["detail", "not-a-job-id"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("BAD_ID");
  });
});

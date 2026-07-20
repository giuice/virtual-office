import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(
  root,
  "__tests__",
  "presence-db",
  "concurrency",
  "manifest.json",
);
const vitestEntry = path.join(root, "node_modules", "vitest", "vitest.mjs");
const configPath = path.join(root, "vitest.presence-concurrency.config.mts");
const requiredCaseIds = [
  13, 15, 16, 29, 33, 37, 45, 48, 49, 50, 52, 57, 58, 59,
];
const mode = process.argv[2];

if (!["ci", "soak", "staging"].includes(mode)) {
  throw new Error(
    "Usage: node scripts/run-presence-concurrency.mjs <ci|soak|staging>",
  );
}

const iterations = mode === "ci" ? 50 : 200;
const databaseUrl = new URL(
  process.env.PRESENCE_TEST_DB_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function inferSupabaseProjectRef(url) {
  const candidates = new Set();
  const directHost = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/iu);
  if (directHost?.[1]) candidates.add(directHost[1].toLowerCase());
  const decodedUsername = decodeURIComponent(url.username);
  const poolerUsername = decodedUsername.match(/^postgres\.([a-z0-9]+)$/iu);
  if (poolerUsername?.[1]) candidates.add(poolerUsername[1].toLowerCase());
  return candidates.size === 1 ? [...candidates][0] : null;
}

if (mode === "staging") {
  if (process.env.PRESENCE_CONCURRENCY_TARGET_CLASS !== "staging") {
    throw new Error(
      "Staging soak requires PRESENCE_CONCURRENCY_TARGET_CLASS=staging",
    );
  }
  if (!process.env.PRESENCE_CONCURRENCY_TARGET_REF) {
    throw new Error("Staging soak requires PRESENCE_CONCURRENCY_TARGET_REF");
  }
  if (!process.env.PRESENCE_CONCURRENCY_STAGING_DB_HOST) {
    throw new Error(
      "Staging soak requires PRESENCE_CONCURRENCY_STAGING_DB_HOST from protected configuration",
    );
  }
  if (
    process.env.PRESENCE_CONCURRENCY_APPROVAL_ACK !== "I_APPROVE_STAGING_SOAK"
  ) {
    throw new Error(
      "Staging soak requires the explicit staging approval acknowledgement",
    );
  }
  if (process.env.PRESENCE_CONCURRENCY_PRODUCTION === "true") {
    throw new Error("The concurrency runner refuses production targets");
  }
  if (loopbackHosts.has(databaseUrl.hostname)) {
    throw new Error(
      "Staging soak requires a named non-loopback staging database",
    );
  }
  if (
    databaseUrl.hostname.toLowerCase() !==
    process.env.PRESENCE_CONCURRENCY_STAGING_DB_HOST.toLowerCase()
  ) {
    throw new Error(
      "Staging database host does not match protected staging configuration",
    );
  }
  const actualProjectRef = inferSupabaseProjectRef(databaseUrl);
  if (
    !actualProjectRef ||
    actualProjectRef !==
      process.env.PRESENCE_CONCURRENCY_TARGET_REF.toLowerCase()
  ) {
    throw new Error(
      "Staging target ref does not match the project identity encoded by the database URL",
    );
  }
} else if (
  !loopbackHosts.has(databaseUrl.hostname) ||
  databaseUrl.port !== "54322"
) {
  throw new Error(
    "CI/local concurrency runs are restricted to local Supabase on loopback:54322",
  );
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases)) {
  throw new Error("Invalid Presence concurrency manifest");
}

const manifestIds = manifest.cases.map((entry) => entry.caseId);
if (
  JSON.stringify([...manifestIds].sort((a, b) => a - b)) !==
  JSON.stringify(requiredCaseIds)
) {
  throw new Error(
    "Manifest must contain every normative concurrency case exactly once",
  );
}
const tags = manifest.cases.map((entry) => entry.tag);
if (new Set(tags).size !== tags.length) {
  throw new Error("Manifest contains duplicate concurrency tags");
}

const tempAuthority = path.resolve(process.env.RUNNER_TEMP ?? os.tmpdir());
const reportDirectory = path.resolve(
  process.env.PRESENCE_CONCURRENCY_REPORT_DIR ??
    path.join(tempAuthority, "virtual-office-presence-concurrency"),
);
const relativeReportDirectory = path.relative(tempAuthority, reportDirectory);
if (
  relativeReportDirectory.startsWith("..") ||
  path.isAbsolute(relativeReportDirectory)
) {
  throw new Error(
    "Concurrency evidence must remain under the operating-system temp directory",
  );
}
await mkdir(reportDirectory, { recursive: true });

const reportPath = path.join(reportDirectory, "report.ndjson");
await writeFile(reportPath, "", "utf8");

for (let iteration = 0; iteration < iterations; iteration += 1) {
  const iterationReport = path.join(
    reportDirectory,
    `iteration-${iteration}.json`,
  );
  const result = spawnSync(
    process.execPath,
    [
      vitestEntry,
      "run",
      "--config",
      configPath,
      "--no-file-parallelism",
      "--maxWorkers=1",
      "--pool=forks",
      "--reporter=json",
      "--outputFile",
      iterationReport,
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        PRESENCE_TEST_DB_URL: databaseUrl.toString(),
        PRESENCE_CONCURRENCY_SINGLE_ITERATION: "1",
        PRESENCE_CONCURRENCY_ITERATION: String(iteration),
      },
    },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`Concurrency iteration ${iteration} failed`);
  }

  const vitestReport = JSON.parse(await readFile(iterationReport, "utf8"));
  const assertions = (vitestReport.testResults ?? []).flatMap(
    (testFile) => testFile.assertionResults ?? [],
  );

  for (const entry of manifest.cases) {
    const prefix = `[presence-concurrency:${entry.tag}]`;
    const matches = assertions.filter((assertion) =>
      assertion.title?.startsWith(prefix),
    );
    if (matches.length !== 1) {
      throw new Error(
        `Iteration ${iteration} produced ${matches.length} results for ${entry.tag}; expected exactly one`,
      );
    }
    if (matches[0].status !== "passed") {
      throw new Error(`Iteration ${iteration} did not pass ${entry.tag}`);
    }
    await appendFile(
      reportPath,
      `${JSON.stringify({
        schemaVersion: 1,
        mode,
        iteration,
        caseId: entry.caseId,
        tag: entry.tag,
        durationMs: matches[0].duration ?? null,
      })}\n`,
      "utf8",
    );
  }

  await rm(iterationReport, { force: true });
  if ((iteration + 1) % 5 === 0 || iteration + 1 === iterations) {
    process.stdout.write(
      `Presence concurrency: ${iteration + 1}/${iterations} iterations passed\n`,
    );
  }
}

const records = (await readFile(reportPath, "utf8"))
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
for (const entry of manifest.cases) {
  const caseRecords = records.filter((record) => record.tag === entry.tag);
  const observedIterations = caseRecords
    .map((record) => record.iteration)
    .sort((a, b) => a - b);
  const expectedIterations = Array.from(
    { length: iterations },
    (_, index) => index,
  );
  if (
    caseRecords.length !== iterations ||
    new Set(observedIterations).size !== iterations ||
    JSON.stringify(observedIterations) !== JSON.stringify(expectedIterations)
  ) {
    throw new Error(`Fail-closed report validation failed for ${entry.tag}`);
  }
}

process.stdout.write(
  `Presence concurrency ${mode} gate passed: ${manifest.cases.length} cases x ${iterations} iterations\n`,
);
process.stdout.write(`PRESENCE_CONCURRENCY_REPORT=${reportPath}\n`);

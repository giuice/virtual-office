import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED_REFERENCES = [
  'access-capacity.md',
  'known-issues.md',
  'realtime-debugging.md',
  'state-model.md',
  'testing.md',
  'transitions.md',
];
const REQUIRED_REPLACEMENTS = [
  'presence-guard.md',
  'presence-safety-reviewer.md',
  'presence-space-pitfalls-guide.md',
];
const REQUIRED_SCENARIO_IDS = [
  'transient-reload-placement', 'duplicate-selection-movement',
  'stale-company-context-placement', 'disconnected-away-busy',
  'status-capacity', 'last-active-private-access',
  'browser-self-approved-knock', 'old-log-grace', 'one-tab-close',
  'auto-after-manual', 'dedup-is-success', 'global-cache-account-switch',
  'public-presence-user-id', 'subscribed-without-reconcile',
  'zero-row-knock-response', 'mocks-prove-concurrency',
  'production-service-probe', 'single-skill-copy',
  'reactivate-expired-session', 'tab-local-generation',
  'same-target-before-auth', 'revision-mismatch-rejoin',
  'validate-before-lock-only', 'cron-cleanup-timestamp',
  'merged-postgrest-snapshot', 'server-knock-before-client',
  'consume-knock-after-requester-moved', 'superseded-active-guard',
];
const FORWARDING_LINK =
  '[canonical Presence Safety skill](../../../.agents/skills/presence-safety/SKILL.md)';

function fail(message) {
  throw new Error(`Presence skill validation failed: ${message}`);
}

async function requireRegularFile(filePath) {
  const stat = await lstat(filePath).catch(() => null);
  if (!stat) fail(`missing file ${path.relative(ROOT, filePath)}`);
  if (stat.isSymbolicLink()) fail(`symlink is not allowed for ${path.relative(ROOT, filePath)}`);
  if (!stat.isFile()) fail(`not a regular file: ${path.relative(ROOT, filePath)}`);
}

function referencedMarkdown(skillText) {
  const matches = [...skillText.matchAll(/\]\((references\/[^)]+\.md)\)/g)].map(
    (match) => match[1],
  );
  if (new Set(matches).size !== matches.length) fail('duplicate reference link in SKILL.md');
  for (const reference of matches) {
    if (!/^references\/[a-z0-9-]+\.md$/.test(reference)) {
      fail(`reference must be a one-level normalized path: ${reference}`);
    }
  }
  return matches;
}

function validateSkillText(text, label) {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    fail(`${label} is missing YAML frontmatter`);
  }
  if (!/^name:\s*presence-safety\s*$/m.test(text)) fail(`${label} has wrong name`);
  if (!/^description:\s*>/m.test(text)) fail(`${label} needs a folded description`);
  if (/\b(?:line|lines)\s+\d+(?:\s*[-–]\s*\d+)?\b/i.test(text)) {
    fail(`${label} contains approximate line-number guidance`);
  }
  if (/verified\s+20\d{2}|as of\s+20\d{2}|probe-verified/i.test(text)) {
    fail(`${label} contains a dated live-infrastructure assertion`);
  }
}

async function validateDraft() {
  const base = path.join(ROOT, 'docs', 'presence-safety-skill-draft');
  const skillPath = path.join(base, 'SKILL.md');
  await requireRegularFile(skillPath);
  const skillText = await readFile(skillPath, 'utf8');
  validateSkillText(skillText, 'draft SKILL.md');

  const referencedNames = referencedMarkdown(skillText).map((item) => path.basename(item)).sort();
  if (JSON.stringify(referencedNames) !== JSON.stringify(REQUIRED_REFERENCES)) {
    fail(`draft references differ from required set: ${referencedNames.join(', ')}`);
  }

  const referenceDir = path.join(base, 'references');
  const diskReferences = (await readdir(referenceDir)).filter((name) => name.endsWith('.md')).sort();
  if (JSON.stringify(diskReferences) !== JSON.stringify(REQUIRED_REFERENCES)) {
    fail(`unreferenced or missing draft reference: ${diskReferences.join(', ')}`);
  }
  for (const name of REQUIRED_REFERENCES) {
    const referencePath = path.join(referenceDir, name);
    await requireRegularFile(referencePath);
    const text = await readFile(referencePath, 'utf8');
    if (!text.trim()) fail(`empty reference ${name}`);
    if (/\b(?:line|lines)\s+\d+(?:\s*[-–]\s*\d+)?\b/i.test(text)) {
      fail(`${name} contains approximate line-number guidance`);
    }
    if (/probe-verified|verified\s+20\d{2}|as of\s+20\d{2}/i.test(text)) {
      fail(`${name} contains a dated live-infrastructure assertion`);
    }
  }

  const replacementDir = path.join(base, 'replacements');
  const replacements = (await readdir(replacementDir)).filter((name) => name.endsWith('.md')).sort();
  if (JSON.stringify(replacements) !== JSON.stringify(REQUIRED_REPLACEMENTS)) {
    fail(`replacement drafts differ from required set: ${replacements.join(', ')}`);
  }
  for (const name of replacements) await requireRegularFile(path.join(replacementDir, name));
}

async function validatePromoted() {
  const canonical = path.join(ROOT, '.agents', 'skills', 'presence-safety');
  const skillPath = path.join(canonical, 'SKILL.md');
  await requireRegularFile(skillPath);
  const skillText = await readFile(skillPath, 'utf8');
  validateSkillText(skillText, 'promoted SKILL.md');
  const references = referencedMarkdown(skillText).map((item) => path.basename(item)).sort();
  if (JSON.stringify(references) !== JSON.stringify(REQUIRED_REFERENCES)) {
    fail(`promoted references differ from required set: ${references.join(', ')}`);
  }

  const referenceDir = path.join(canonical, 'references');
  const diskReferences = (await readdir(referenceDir)).filter((name) => name.endsWith('.md')).sort();
  if (JSON.stringify(diskReferences) !== JSON.stringify(REQUIRED_REFERENCES)) {
    fail(`unreferenced or missing promoted reference: ${diskReferences.join(', ')}`);
  }
  for (const reference of references) {
    await requireRegularFile(path.join(referenceDir, reference));
  }

  for (const host of ['.claude', '.codex', '.pi']) {
    const hostSkill = path.join(ROOT, host, 'skills', 'presence-safety', 'SKILL.md');
    await requireRegularFile(hostSkill);
    const hostText = await readFile(hostSkill, 'utf8');
    validateSkillText(hostText, `${host} forwarding SKILL.md`);
    if (!hostText.includes(FORWARDING_LINK)) {
      fail(`${host} presence skill does not forward to the canonical tree`);
    }
    if (!/Do not add Presence rules here/i.test(hostText)) {
      fail(`${host} forwarding skill does not prevent rule duplication`);
    }
  }
}

async function validateScenarios() {
  const scenarioPath = path.join(ROOT, 'docs', 'presence-safety-evals', 'scenarios.json');
  await requireRegularFile(scenarioPath);
  const parsed = JSON.parse(await readFile(scenarioPath, 'utf8'));
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.scenarios)) {
    fail('scenario fixture has an invalid root schema');
  }
  const ids = [];
  for (const scenario of parsed.scenarios) {
    for (const field of ['id', 'title', 'scenario', 'proposedDiff', 'requiredSafeBehavior', 'forbiddenUnsafeBehavior']) {
      if (typeof scenario[field] !== 'string' || !scenario[field].trim()) {
        fail(`scenario ${scenario.id ?? '<unknown>'} has invalid ${field}`);
      }
    }
    if (!/^[a-z0-9-]+$/.test(scenario.id)) fail(`invalid scenario ID ${scenario.id}`);
    if (!Array.isArray(scenario.invariantIds) || scenario.invariantIds.length === 0 ||
        scenario.invariantIds.some((id) => typeof id !== 'string' || !id.trim())) {
      fail(`scenario ${scenario.id} has invalid invariantIds`);
    }
    ids.push(scenario.id);
  }
  if (new Set(ids).size !== ids.length) fail('scenario IDs are not unique');
  if (JSON.stringify(ids) !== JSON.stringify(REQUIRED_SCENARIO_IDS)) {
    fail('scenario set or order differs from the required 28 cases');
  }
}

async function validatePackageScripts() {
  const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const expected = {
    'presence:skill:validate': 'node scripts/validate-presence-skill.mjs',
    'presence:skill:eval': 'node scripts/evaluate-presence-skill.mjs',
  };
  for (const [name, value] of Object.entries(expected)) {
    if (packageJson.scripts?.[name] !== value) fail(`package script ${name} is missing or inexact`);
  }
  await requireRegularFile(path.join(ROOT, 'scripts', 'evaluate-presence-skill.mjs'));
}

const args = process.argv.slice(2);
if (args.length > 2 || (args[0] && args[0] !== '--target')) {
  fail('usage: node scripts/validate-presence-skill.mjs [--target draft|promoted]');
}
const target = args[0] ? args[1] : 'promoted';
if (target !== 'draft' && target !== 'promoted') fail(`unknown target ${String(target)}`);

if (target === 'draft') await validateDraft();
else await validatePromoted();
await validateScenarios();
await validatePackageScripts();
console.log(`Presence skill ${target} validation passed.`);

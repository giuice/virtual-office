// __tests__/guards/no-credential-logging.test.ts
//
// Phase 3.5 WP1 guard (VO-RUNTIME-001): no console.* call under src/ may
// reference credential-bearing identifiers (`session`, `access_token`,
// `refresh_token`, `provider_token`) or embed JWT-like literals.
// Allowlist a deliberate, reviewed log line with a trailing
// `// vo-log-audited` comment on the call's first or last line.
//
// Detection is AST-based (TypeScript compiler API): only identifier
// REFERENCES count. Benign string literals such as
// `console.error("Error getting initial session:", error)` are not flagged.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

const BANNED_IDENTIFIERS = new Set([
  'session',
  'access_token',
  'refresh_token',
  'provider_token',
]);
const JWT_LIKE = /eyJ[A-Za-z0-9_-]{10,}/;
const ALLOWLIST_MARKER = '// vo-log-audited';

interface Violation {
  file: string;
  line: number;
  snippet: string;
}

function scanSource(sourceText: string, fileName: string): Violation[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lines = sourceText.split(/\r?\n/);
  const violations: Violation[] = [];

  const isConsoleCall = (node: ts.Node): node is ts.CallExpression =>
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'console';

  const containsBannedReference = (node: ts.Node): boolean => {
    if (ts.isIdentifier(node) && BANNED_IDENTIFIERS.has(node.text)) {
      return true;
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      JWT_LIKE.test(node.text)
    ) {
      return true;
    }
    if (ts.isTemplateExpression(node)) {
      const literalText =
        node.head.text + node.templateSpans.map((span) => span.literal.text).join('');
      if (JWT_LIKE.test(literalText)) {
        return true;
      }
    }
    return ts.forEachChild(node, containsBannedReference) ?? false;
  };

  const visit = (node: ts.Node): void => {
    if (isConsoleCall(node)) {
      const startLine = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      ).line;
      const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
      const allowlisted = [startLine, endLine].some((lineIndex) =>
        lines[lineIndex]?.includes(ALLOWLIST_MARKER),
      );
      if (!allowlisted && node.arguments.some(containsBannedReference)) {
        violations.push({
          file: fileName,
          line: startLine + 1,
          snippet: lines[startLine]?.trim() ?? '',
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

function collectSourceFiles(dir: string): string[] {
  const collected: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collected.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      collected.push(fullPath);
    }
  }
  return collected;
}

describe('no-credential-logging guard', () => {
  it('src tree has no console.* call referencing credentials', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const violations = collectSourceFiles(srcRoot).flatMap((filePath) =>
      scanSource(
        fs.readFileSync(filePath, 'utf8'),
        path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
      ),
    );

    const report = violations
      .map((v) => `${v.file}:${v.line} — ${v.snippet}`)
      .join('\n');
    expect(violations, `Credential-logging violations found:\n${report}`).toEqual([]);
  });

  describe('scanner sensitivity fixtures', () => {
    it('flags a session object logged alongside a template literal', () => {
      const fixture = 'console.log(`Auth state changed: ${event}`, session);';
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });

    it('flags a property-access tail reaching a banned identifier', () => {
      const fixture = "console.log('token', data.session);";
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });

    it('does not flag benign string literals mentioning "session"', () => {
      const fixture = "console.error('Error getting initial session:', error);";
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(0);
    });

    it('flags JWT-like string literals', () => {
      const fixture =
        "console.log('jwt', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');";
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });

    it('skips calls allowlisted with the vo-log-audited marker', () => {
      const fixture = "console.log('debug', session) // vo-log-audited";
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(0);
    });
  });
});

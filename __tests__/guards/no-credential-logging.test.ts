// __tests__/guards/no-credential-logging.test.ts
//
// Phase 3.5 WP1 guard (VO-RUNTIME-001): no console.* call under src/ may
// reference credential-bearing identifiers (`session`, `access_token`,
// `refresh_token`, `provider_token`, `provider_refresh_token`, `id_token`,
// `session_id`, `user_metadata`, `password`) or embed JWT-like literals.
// Allowlist a deliberate, reviewed log line with a trailing
// `// vo-log-audited` comment on the call's first or last line — the marker
// must be a REAL comment (verified via the TypeScript scanner's trivia), so a
// string argument containing "// vo-log-audited" does not bypass the guard.
//
// Detection is deliberately narrow and AST-based (TypeScript compiler API):
// - identifier references, element-access string keys (obj['refresh_token'])
//   and JWT-like literals count;
// - file-local name taint follows access-path aliases, assignments, banned-key
//   destructuring, and object/array spreads of tainted values to a fixpoint;
// - direct console calls, bracket callees, local console-object aliases, local
//   console-method aliases, and console-method destructuring are checked;
// - benign string literals such as
//   `console.error("Error getting initial session:", error)` are not flagged.
// This is not general credential-flow protection: it does not follow values
// returned from arbitrary function calls (for example,
// `const json = JSON.stringify(session)`) or flows across files, and its
// name-based analysis is not scope-sensitive. A rare false positive is
// allowlisted with `// vo-log-audited` after review.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

const BANNED_IDENTIFIERS = new Set([
  'session',
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'id_token',
  'session_id',
  'user_metadata',
  'password',
]);
const JWT_LIKE = /eyJ[A-Za-z0-9_-]{10,}/;
const ALLOWLIST_MARKER = 'vo-log-audited';

interface Violation {
  file: string;
  line: number;
  snippet: string;
}

/** Lines (0-based) containing a REAL comment (trivia) with the allowlist marker. */
function collectAuditedCommentLines(
  sourceFile: ts.SourceFile,
  sourceText: string,
  isTsx: boolean,
): Set<number> {
  const auditedLines = new Set<number>();
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    isTsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    sourceText,
  );
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      (token === ts.SyntaxKind.SingleLineCommentTrivia ||
        token === ts.SyntaxKind.MultiLineCommentTrivia) &&
      scanner.getTokenText().includes(ALLOWLIST_MARKER)
    ) {
      auditedLines.add(
        sourceFile.getLineAndCharacterOfPosition(scanner.getTokenStart()).line,
      );
    }
    token = scanner.scan();
  }
  return auditedLines;
}

const isStringLike = (
  node: ts.Node,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

/** True if the subtree references a banned/tainted name or embeds a JWT-like literal. */
function containsBannedReference(node: ts.Node, tainted: ReadonlySet<string>): boolean {
  if (ts.isIdentifier(node) && (BANNED_IDENTIFIERS.has(node.text) || tainted.has(node.text))) {
    return true;
  }
  // obj['refresh_token'], obj[`session`]
  if (
    ts.isElementAccessExpression(node) &&
    isStringLike(node.argumentExpression) &&
    BANNED_IDENTIFIERS.has(node.argumentExpression.text)
  ) {
    return true;
  }
  if (isStringLike(node) && JWT_LIKE.test(node.text)) {
    return true;
  }
  if (ts.isTemplateExpression(node)) {
    const literalText =
      node.head.text + node.templateSpans.map((span) => span.literal.text).join('');
    if (JWT_LIKE.test(literalText)) {
      return true;
    }
  }
  return ts.forEachChild(node, (child) => containsBannedReference(child, tainted)) ?? false;
}

/**
 * File-local, name-based taint: a variable becomes banned when it is
 * initialized/assigned from a credential ACCESS PATH — an identifier /
 * property-access / element-access chain that passes through a banned or
 * tainted name (`data.session`, `x['access_token']`, `aliasOfSession`) — or
 * from a JWT-like literal, destructured from a banned key, or initialized
 * from an object/array literal that spreads a credential source. Deliberately
 * narrower than "expression mentions a banned name anywhere": results of
 * arbitrary calls are not tainted, including assigned serialization such as
 * `const json = JSON.stringify(session)`. Cross-file flow is also out of
 * scope. Iterated to a fixpoint so file-local alias chains are followed.
 */
function collectTaintedNames(sourceFile: ts.SourceFile): Set<string> {
  const tainted = new Set<string>();
  let changed = true;

  const taint = (name: string): void => {
    if (!tainted.has(name)) {
      tainted.add(name);
      changed = true;
    }
  };

  const propertyKeyText = (name: ts.PropertyName): string | undefined => {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
    return undefined;
  };

  const isCredentialSource = (node: ts.Expression): boolean => {
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isAwaitExpression(node)
    ) {
      return isCredentialSource(node.expression);
    }
    if (ts.isIdentifier(node)) {
      return BANNED_IDENTIFIERS.has(node.text) || tainted.has(node.text);
    }
    if (ts.isPropertyAccessExpression(node)) {
      return (
        BANNED_IDENTIFIERS.has(node.name.text) ||
        tainted.has(node.name.text) ||
        isCredentialSource(node.expression)
      );
    }
    if (ts.isElementAccessExpression(node)) {
      const keyBanned =
        isStringLike(node.argumentExpression) &&
        BANNED_IDENTIFIERS.has(node.argumentExpression.text);
      return keyBanned || isCredentialSource(node.expression);
    }
    if (ts.isObjectLiteralExpression(node)) {
      return node.properties.some(
        (property) =>
          ts.isSpreadAssignment(property) &&
          isCredentialSource(property.expression),
      );
    }
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.some(
        (element) =>
          ts.isSpreadElement(element) && isCredentialSource(element.expression),
      );
    }
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      return isCredentialSource(node.left) || isCredentialSource(node.right);
    }
    if (isStringLike(node) && JWT_LIKE.test(node.text)) {
      return true;
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) {
      if (ts.isIdentifier(node.name) && node.initializer && isCredentialSource(node.initializer)) {
        taint(node.name.text);
      }
      if (ts.isObjectBindingPattern(node.name)) {
        const initializerIsCredential =
          node.initializer !== undefined && isCredentialSource(node.initializer);
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const sourceKey = element.propertyName
            ? propertyKeyText(element.propertyName)
            : element.name.text;
          if (
            initializerIsCredential ||
            (sourceKey !== undefined && BANNED_IDENTIFIERS.has(sourceKey))
          ) {
            taint(element.name.text);
          }
        }
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      isCredentialSource(node.right)
    ) {
      taint(node.left.text);
    }
    ts.forEachChild(node, visit);
  };

  while (changed) {
    changed = false;
    visit(sourceFile);
  }
  return tainted;
}

interface ConsoleAliases {
  objects: Set<string>;
  methods: Set<string>;
}

function collectConsoleAliases(sourceFile: ts.SourceFile): ConsoleAliases {
  const objects = new Set(['console']);
  const methods = new Set<string>();
  let changed = true;

  const add = (names: Set<string>, name: string): void => {
    if (!names.has(name)) {
      names.add(name);
      changed = true;
    }
  };

  const unwrap = (node: ts.Expression): ts.Expression => {
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node)
    ) {
      return unwrap(node.expression);
    }
    return node;
  };

  const isConsoleObjectSource = (expression: ts.Expression): boolean => {
    const node = unwrap(expression);
    return ts.isIdentifier(node) && objects.has(node.text);
  };

  const isConsoleMethodSource = (expression: ts.Expression): boolean => {
    const node = unwrap(expression);
    if (ts.isIdentifier(node)) return methods.has(node.text);
    if (ts.isPropertyAccessExpression(node)) {
      return isConsoleObjectSource(node.expression);
    }
    return (
      ts.isElementAccessExpression(node) &&
      isConsoleObjectSource(node.expression) &&
      isStringLike(node.argumentExpression)
    );
  };

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) {
        if (isConsoleObjectSource(node.initializer)) add(objects, node.name.text);
        if (isConsoleMethodSource(node.initializer)) add(methods, node.name.text);
      } else if (
        ts.isObjectBindingPattern(node.name) &&
        isConsoleObjectSource(node.initializer)
      ) {
        for (const element of node.name.elements) {
          if (ts.isIdentifier(element.name)) add(methods, element.name.text);
        }
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      if (isConsoleObjectSource(node.right)) add(objects, node.left.text);
      if (isConsoleMethodSource(node.right)) add(methods, node.left.text);
    }
    ts.forEachChild(node, visit);
  };

  while (changed) {
    changed = false;
    visit(sourceFile);
  }
  return { objects, methods };
}

function scanSource(sourceText: string, fileName: string): Violation[] {
  const isTsx = fileName.endsWith('.tsx');
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lines = sourceText.split(/\r?\n/);
  const auditedCommentLines = collectAuditedCommentLines(sourceFile, sourceText, isTsx);
  const tainted = collectTaintedNames(sourceFile);
  const consoleAliases = collectConsoleAliases(sourceFile);
  const violations: Violation[] = [];

  // Direct/aliased console objects and direct/aliased console methods.
  const isConsoleCall = (node: ts.Node): node is ts.CallExpression => {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    if (ts.isIdentifier(callee)) {
      return consoleAliases.methods.has(callee.text);
    }
    if (ts.isPropertyAccessExpression(callee)) {
      return (
        ts.isIdentifier(callee.expression) &&
        consoleAliases.objects.has(callee.expression.text)
      );
    }
    if (ts.isElementAccessExpression(callee)) {
      return (
        ts.isIdentifier(callee.expression) &&
        consoleAliases.objects.has(callee.expression.text) &&
        isStringLike(callee.argumentExpression)
      );
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (isConsoleCall(node)) {
      const startLine = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      ).line;
      const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
      const allowlisted =
        auditedCommentLines.has(startLine) || auditedCommentLines.has(endLine);
      if (
        !allowlisted &&
        node.arguments.some((argument) => containsBannedReference(argument, tainted))
      ) {
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
  }, 15_000);

  describe('scanner sensitivity fixtures', () => {
    it('flags a session object logged alongside a template literal', () => {
      const fixture = 'console.log(`Auth state changed: ${event}`, session);';
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });

    it('flags a property-access tail reaching a banned identifier', () => {
      const fixture = "console.log('token', data.session);";
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });

    it('flags user_metadata (may carry provider tokens/PII)', () => {
      const fixture = "console.log('User META data:', user?.user_metadata);";
      expect(scanSource(fixture, 'fixture.tsx')).toHaveLength(1);
    });

    it('flags element-access string keys', () => {
      const fixture = "console.log(data['refresh_token']);";
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });

    it('flags bracket console callees', () => {
      const fixture = "console['log'](session);";
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });

    it('flags newly banned identifiers', () => {
      for (const banned of ['password', 'id_token', 'session_id', 'provider_refresh_token']) {
        const fixture = `console.log('debug', ${banned});`;
        expect(scanSource(fixture, 'fixture.ts'), banned).toHaveLength(1);
      }
    });

    it('flags aliased credentials (declaration taint)', () => {
      const fixture = 'const authSession = data.session;\nconsole.log(authSession);';
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });

    it('flags aliased element-access credentials', () => {
      const fixture = "const token = data['access_token'];\nconsole.log(token);";
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });

    it('flags renamed destructuring of banned keys', () => {
      const fixture = 'const { session: s } = supabase;\nconsole.log(s);';
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });

    it('flags transitive alias chains and assignments', () => {
      const fixture =
        'const a = session;\nlet b;\nb = a;\nconst c = b;\nconsole.log(c);';
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });

    it('flags credentials copied through an object spread', () => {
      const fixture =
        'const snapshot = { ...session };\nconsole.log(snapshot);';
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });

    it('flags credentials logged through a console method alias', () => {
      const fixture = 'const log = console.log;\nlog(session);';
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });

    it('does not taint unrelated variables', () => {
      const fixture = 'const name = user.displayName;\nconsole.log(name);';
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(0);
    });

    it('does not flag benign string literals mentioning credentials', () => {
      const fixtures = [
        "console.error('Error getting initial session:', error);",
        "console.log('enter your password:');",
      ];
      for (const fixture of fixtures) {
        expect(scanSource(fixture, 'fixture.ts'), fixture).toHaveLength(0);
      }
    });

    it('flags JWT-like string literals', () => {
      const fixture =
        "console.log('jwt', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');";
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });

    it('skips calls allowlisted with a real vo-log-audited comment', () => {
      const fixture = "console.log('debug', session) // vo-log-audited";
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(0);
    });

    it('is NOT fooled by an allowlist marker inside a string argument', () => {
      const fixture = "console.log(session, '// vo-log-audited');";
      expect(scanSource(fixture, 'fixture.ts')).toHaveLength(1);
    });
  });
});

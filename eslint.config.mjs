import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import ts from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooksPlugin from 'eslint-plugin-react-hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** @type {import('eslint').Linter.FlatConfig[]} */
const eslintConfig = [
  {
    ignores: [".next/**/*", "node_modules/**/*"],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ...compat.extends("next/core-web-vitals")[0]
  },
  {
    files: ["**/*.{ts,tsx,d.ts}"],
    plugins: {
      "@typescript-eslint": ts,
      "react-hooks": reactHooksPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ["./tsconfig.json"],
        ecmaVersion: "latest",
        sourceType: "module",
        tsconfigRootDir: __dirname,
        ecmaFeatures: {
          jsx: true
        }
      },
    },
    rules: {
      // TypeScript Rules
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-floating-promises": ["error", { 
        "ignoreVoid": true,
        "ignoreIIFE": true
      }],
      "@typescript-eslint/await-thenable": "warn",
      "@typescript-eslint/no-misused-promises": ["error", {
        "checksVoidReturn": false
      }],
      "@typescript-eslint/strict-boolean-expressions": "off",
      
      // React Rules
      "react/react-in-jsx-scope": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/await-thenable": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "react/react-in-jsx-scope": "off", // Not needed with React 17+
      "react-hooks/exhaustive-deps": "warn",
      "react/no-unescaped-entities": "off"
    }
  }
];

export default eslintConfig;

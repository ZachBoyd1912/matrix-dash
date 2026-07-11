import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import eslintConfigPrettier from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  eslintConfigPrettier,
  {
    rules: {
      // ~55 pre-existing instances, concentrated in lib/services/github.ts (GitHub
      // API response typing). Warn rather than error for this first lint rollout;
      // ratchet back to "error" once those response shapes are typed.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      ".netlify/**",
      ".agent/**",
      "node_modules/**",
      "public/**",
      "next-env.d.ts",
      "vscode-extension/**",
      "runner/dist/**",
    ],
  },
];

export default eslintConfig;

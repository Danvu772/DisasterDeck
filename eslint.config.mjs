import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["e2e/**", 
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // design-sync: staged converter, its output, generated types
      ".ds-sync/**",
      "ds-bundle/**",
      "dist/**",
      ".design-sync/**",
    ],
  },
];

export default eslintConfig;

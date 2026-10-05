import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored third-party assets: MediaPipe WASM glue is copied verbatim from
    // node_modules by scripts/copy-mediapipe.mjs (in-file disables would be
    // overwritten), models are data. Not lintable first-party code.
    "public/**",
  ]),
]);

export default eslintConfig;

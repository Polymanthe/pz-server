import js from "@eslint/js";
import tseslint from "typescript-eslint";

// The hexagonal boundary is enforced here rather than merely documented.
// Without a mechanical guard, the domain slowly grows I/O and framework imports.
const forbiddenInDomain = [
  {
    group: [
      "node:*",
      "fs",
      "fs/*",
      "path",
      "os",
      "http",
      "https",
      "net",
      "child_process",
      "crypto",
    ],
    message:
      "The domain must stay free of I/O. Put filesystem and network access behind a port, implemented in src/adapters.",
  },
  {
    group: [
      "astro",
      "astro:*",
      "astro/*",
      "@astrojs/*",
      "react",
      "react-dom",
      "react-dom/*",
      "rcon-client",
    ],
    message:
      "The domain must not depend on a framework or a client library. Define a port and implement it in src/adapters.",
  },
  {
    group: ["**/adapters/*", "**/adapters/**"],
    message:
      "The domain must not import an adapter. Depend on a port; composition.ts wires the implementation.",
  },
];

export default tseslint.config(
  { ignores: ["dist/**", ".astro/**", "node_modules/**"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: forbiddenInDomain }],
    },
  },
);

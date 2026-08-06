// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// Pages are prerendered by default. Only routes that opt out with
// `export const prerender = false` are rendered on demand by the Node adapter.
export default defineConfig({
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      // The server bundle imports es-module-lexer as a bare specifier, but a
      // production-only npm install nests it under astro/node_modules where
      // dist/server/entry.mjs cannot resolve it. Inlining removes the
      // dependency on npm's hoisting decisions.
      noExternal: ["es-module-lexer"],
    },
  },
});

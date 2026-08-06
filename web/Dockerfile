# Bun installs and builds; Node runs the result. The @astrojs/node adapter
# targets Node, so the runtime stays on the combination Astro supports, while
# dependency management matches what the repository uses everywhere else.
#
# The trustedDependencies field in package.json is what lets bun run the
# install scripts esbuild and sharp need.

# A dedicated production install. Pruning a full install is not equivalent:
# it leaves the hoisted layout behind, and the server bundle resolves bare
# specifiers from /app/node_modules.
FROM oven/bun:1.3.13-slim AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.13-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=4321
WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Created here so the named volume mounted over it inherits this ownership.
# Docker would otherwise create it as root and the service could not write.
RUN mkdir -p /var/cache/pz-web && chown node:node /var/cache/pz-web

USER node
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]

# Project Zomboid Server Repository Guidelines

## Purpose

This repository defines one portable Project Zomboid dedicated server deployment. The same Compose file must run on Linux amd64 hosts and Apple Silicon through Docker emulation.

Each host owns an independent world. Do not add save synchronization, shared storage, or automatic migration between hosts unless explicitly requested.

## Sources Of Truth

- `compose.yaml` defines the runtime topology, ports, volumes, health checks, and resource limits.
- `.env.example` documents every supported deployment variable.
- Each deployment provides its own untracked `.env`.
- `Taskfile.yml` is the operator interface.
- `mise.toml` pins project CLI tools. Docker remains a system prerequisite.
- `mods/enabled.toml` selects the active Workshop pack.
- `mods/catalog.lock.json` inventories Workshop IDs, mod IDs, and dependencies discovered from Steam.
- `mods/resolved.env` is generated from the selection and is the active server mod configuration.
- `web/` is the companion site. `caddy/Caddyfile` is its reverse proxy configuration.

Do not introduce host-specific Compose files when an environment variable is sufficient.

## Portability

- The Project Zomboid image and game server are `linux/amd64` workloads.
- Keep `platform: linux/amd64` in Compose so Apple Silicon uses Docker Desktop emulation.
- Runtime data belongs in named volumes, not repository bind mounts.
- Do not set an explicit Compose project name.
- Keep the required game ports configurable and published over UDP.
- RCON must not be published on the host by default.

## Data And Secrets

- Never commit `.env`, passwords, generated server files, saves, databases, logs, or backups.
- Named volumes are local to each Docker engine and may be recreated independently.
- Treat `server-data` as valuable once a host is used for real players, even though worlds are not moved between hosts.
- Never run `docker compose down --volumes`, remove a named volume, or reset a world without explicit confirmation from the user.
- Treat a mod removal as potentially world-breaking. Confirm it explicitly and make a backup before applying it to a non-development world.

## Operations

Prefer the corresponding Task command over invoking multi-step Docker commands manually:

- `task init`
- `task doctor`
- `task config`
- `task up`
- `task logs`
- `task status`
- `task stop`
- `task down`
- `task update`
- `task reset CONFIRM=reset`
- `task connection`
- `task mods:sync`
- `task mods:plan`
- `task mods:apply CONFIRM=mods`
- `task mods:diff`
- `task mods:refresh WORKSHOP_ID=<id>`
- `task web:build`
- `task web:test`
- `task web:logs`
- `task web:password`

Diagnose a client kick with `task mods:diff` before touching the mod pack. The Project Zomboid message naming a mismatched file is unreliable; a build difference between the server and a client reports as an unrelated vanilla file.

Stopping the container must allow Project Zomboid to save and quit gracefully. Preserve an adequate `stop_grace_period` and verify shutdown behavior when changing the image or entrypoint.

## Companion Site

The site in `web/` lives behind the Compose profile `web`. It is optional: `task up` must keep working with the profile disabled.

- The `web` service is unprivileged. It mounts `server-data` and `server-files` read-only, reaches the game server only over RCON on the Compose network, and must never be given the Docker socket. A service exposed to the internet does not get root on the host.
- The site describes what the server actually loads, read from `Server/<name>.ini` and the Workshop content, never from the repository files. Those two can legitimately disagree until `task mods:apply` runs.
- Configuration must never throw. A missing environment variable is collected as a problem and displayed on the page; the site keeps serving every route. An operator repairing a broken `.env` needs a readable page, not a stack trace.
- Steam enrichment is a bonus. Any failure falls back to the local data silently, and the mod name always comes from `mod.info`: a Workshop item can bundle several mods, so its title names the pack rather than any one mod.
- `src/domain/` contains no I/O and must not import `node:*`, a framework, or an adapter. An ESLint rule enforces this; do not relax it. Add an adapter behind a port instead.
- `versionScore` in `web/src/adapters/catalog/ModInfo.ts` duplicates `version_score` in `scripts/discover_mods.py` on purpose, the two languages having no shared code. Change them together or the site will describe a different mod variant than the one the server loads.
- Run `task web:test` before considering a change to `web/` complete.

## Change Validation

Before considering an infrastructure change complete:

1. Run `task config`.
2. Run `task doctor` when host compatibility is relevant.
3. Start from empty volumes when changing initialization behavior.
4. Confirm the container becomes healthy.
5. Confirm a stop does not require Docker to kill the process.

Keep changes minimal. Do not add Nomad manifests until a Nomad deployment is actually requested.

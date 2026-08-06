import { createWorkshopMods } from "./adapters/catalog/WorkshopMods";
import { withFileCache } from "./adapters/enricher/CachedWorkshopSource";
import { nullModEnricher } from "./adapters/enricher/NullModEnricher";
import { createSteamWorkshopSource } from "./adapters/enricher/SteamWorkshopSource";
import { createWorkshopModEnricher } from "./adapters/enricher/WorkshopModEnricher";
import { createFileSystemJournal } from "./adapters/journal/FileSystemJournal";
import { tolerant } from "./adapters/journal/TolerantJournal";
import { withCache } from "./adapters/probe/CachedServerProbe";
import { createRconServerProbe, createUnavailableProbe } from "./adapters/probe/RconServerProbe";
import { systemClock } from "./adapters/system/SystemClock";
import type { LogExcerpt, LogFile } from "./domain/model/Log";
import type { Mod, ModId } from "./domain/model/Mod";
import type { ServerIdentity, ServerStatus } from "./domain/model/ServerStatus";
import type { ModPosterImage } from "./domain/ports/ModPosterStore";
import { buildConnectionLink } from "./domain/usecases/BuildConnectionLink";
import { getServerStatus } from "./domain/usecases/GetServerStatus";
import { listActiveMods } from "./domain/usecases/ListActiveMods";
import { readLogTail, type ReadLogTailRequest } from "./domain/usecases/ReadLogTail";

function optional(name: string): string | null {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? null : value.trim();
}

function text(name: string, fallback: string): string {
  return optional(name) ?? fallback;
}

function integer(name: string, fallback: number, problems: string[]): number {
  const value = optional(name);
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    problems.push(`${name} doit être un entier ; la valeur ${fallback} est utilisée à la place.`);
    return fallback;
  }
  return parsed;
}

function flag(name: string, fallback: boolean): boolean {
  const value = optional(name);
  return value === null ? fallback : value.toLowerCase() !== "false";
}

export interface Container {
  readonly identity: ServerIdentity;
  getServerStatus(): Promise<ServerStatus>;
  listActiveMods(): Promise<readonly Mod[]>;
  findModPoster(modId: ModId): Promise<ModPosterImage | null>;
  listLogFiles(): Promise<readonly LogFile[]>;
  readLogTail(request: ReadLogTailRequest): Promise<LogExcerpt>;
  /** Null when the deployment has no usable public address. */
  connectionLink(): string | null;
}

/**
 * The composition root. It is the only place that reads the environment and
 * the only place that knows which implementation backs each port.
 *
 * It never throws. A deployment missing a variable must still serve every
 * page, saying plainly what it cannot determine: an operator debugging a bad
 * .env needs the site up, not a stack trace.
 */
function build(): Container {
  const configurationProblems: string[] = [];
  const runtimeProblems = new Set<string>();

  const address = optional("SERVER_CONNECT_ADDRESS");
  if (address === null) {
    configurationProblems.push(
      "SERVER_CONNECT_ADDRESS n'est pas défini : le lien de connexion ne peut pas être calculé.",
    );
  }

  const identity: ServerIdentity = {
    address,
    port: integer("DEFAULT_PORT", 16261, configurationProblems),
    maxPlayers: integer("MAX_PLAYERS", 8, configurationProblems),
  };
  const useSteam = flag("USE_STEAM", true);

  const rconPassword = optional("RCON_PASSWORD");
  if (rconPassword === null) {
    configurationProblems.push(
      "RCON_PASSWORD n'est pas défini : l'état du serveur ne peut pas être lu.",
    );
  }

  const probe =
    rconPassword === null
      ? createUnavailableProbe(
          "RCON_PASSWORD n'est pas défini : l'état du serveur ne peut pas être lu.",
        )
      : withCache(
          createRconServerProbe({
            host: text("PZ_RCON_HOST", "projectzomboid"),
            port: integer("RCON_PORT", 27015, configurationProblems),
            password: rconPassword,
            timeoutMs: integer("PZ_RCON_TIMEOUT_MS", 3000, configurationProblems),
          }),
          integer("PZ_STATUS_CACHE_MS", 5000, configurationProblems),
        );

  // Computed once: it depends only on configuration, and an invalid address
  // must be reported as a problem rather than silently produce no link.
  let connectionLink: string | null = null;
  if (address !== null) {
    try {
      connectionLink = buildConnectionLink({ host: address, port: identity.port, useSteam });
    } catch (error) {
      configurationProblems.push(
        `SERVER_CONNECT_ADDRESS est invalide : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const configDirectory = text("PZ_CONFIG_DIR", "/project-zomboid-config");

  const journal = tolerant(
    createFileSystemJournal({ logsDirectory: `${configDirectory}/Logs` }),
    (message) => runtimeProblems.add(message),
  );

  const { catalog, posters } = createWorkshopMods(
    {
      configDirectory,
      filesDirectory: text("PZ_FILES_DIR", "/project-zomboid"),
      serverName: text("SERVER_NAME", "pzserver"),
    },
    (message) => runtimeProblems.add(message),
  );

  const enricher = flag("PZ_STEAM_ENRICHMENT", true)
    ? createWorkshopModEnricher(
        withFileCache(
          createSteamWorkshopSource({
            timeoutMs: integer("PZ_STEAM_TIMEOUT_MS", 3000, configurationProblems),
          }),
          {
            file: `${text("PZ_CACHE_DIR", "/var/cache/pz-web")}/steam-workshop.json`,
            ttlMs: integer("PZ_STEAM_CACHE_HOURS", 24, configurationProblems) * 3600 * 1000,
            onProblem: (message) => runtimeProblems.add(message),
          },
        ),
      )
    : nullModEnricher;

  return {
    identity,

    listActiveMods: () =>
      listActiveMods({
        catalog,
        enricher,
        onEnrichmentFailure: (error) => {
          console.error("Steam enrichment failed", error);
          runtimeProblems.add(
            "L'enrichissement Steam a échoué ; les données locales sont affichées.",
          );
        },
      }),

    findModPoster: (modId) => posters.find(modId),

    getServerStatus: () =>
      getServerStatus({
        probe,
        journal,
        clock: systemClock,
        identity,
        problems: [...configurationProblems, ...runtimeProblems],
      }),

    listLogFiles: () => journal.available(),

    readLogTail: (request) => readLogTail({ journal }, request),

    connectionLink: () => connectionLink,
  };
}

let instance: Container | undefined;

export function container(): Container {
  instance ??= build();
  return instance;
}

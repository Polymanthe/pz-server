import type { LogFile } from "../src/domain/model/Log";
import type { Mod } from "../src/domain/model/Mod";
import type { Player } from "../src/domain/model/Player";
import type { Clock } from "../src/domain/ports/Clock";
import type { ModCatalog } from "../src/domain/ports/ModCatalog";
import type { ModEnricher } from "../src/domain/ports/ModEnricher";
import type { ServerJournal } from "../src/domain/ports/ServerJournal";
import type { ServerProbe } from "../src/domain/ports/ServerProbe";

export function fixedClock(instant: string): Clock {
  return { now: () => new Date(instant) };
}

export function probeReturning(players: readonly Player[]): ServerProbe {
  return { probe: async () => ({ kind: "players", players }) };
}

export function unreachableProbe(): ServerProbe {
  return { probe: async () => ({ kind: "unreachable" }) };
}

export function unavailableProbe(reason: string): ServerProbe {
  return { probe: async () => ({ kind: "unavailable", reason }) };
}

export function journalWith(overrides: Partial<ServerJournal> = {}): ServerJournal {
  return {
    available: async () => [],
    tail: async () => [],
    lastActivityAt: async () => null,
    currentBuild: async () => null,
    ...overrides,
  };
}

export function logFile(name: string, modifiedAt = "2026-08-06T16:00:00Z"): LogFile {
  return { name, sizeBytes: 1024, modifiedAt: new Date(modifiedAt) };
}

export function mod(id: string, overrides: Partial<Mod> = {}): Mod {
  return {
    id,
    workshopItemId: "1234567890",
    name: id,
    author: null,
    description: null,
    category: null,
    poster: null,
    ...overrides,
  };
}

export function catalogOf(mods: readonly Mod[]): ModCatalog {
  return { activeMods: async () => mods };
}

export function failingEnricher(error: Error): ModEnricher {
  return {
    enrich: async () => {
      throw error;
    },
  };
}

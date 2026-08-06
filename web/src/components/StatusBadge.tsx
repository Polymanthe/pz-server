import { useEffect, useState } from "react";

import type { ServerState } from "../domain/model/ServerStatus";
import type { StatusPayload } from "../shared/StatusPayload";

const REFRESH_MS = 15_000;

const PRESENTATION: Record<ServerState, { label: string; dot: string; text: string }> = {
  online: { label: "En ligne", dot: "bg-online", text: "text-online" },
  starting: { label: "Démarrage en cours", dot: "bg-starting animate-pulse", text: "text-starting" },
  offline: { label: "Hors ligne", dot: "bg-offline", text: "text-offline" },
  unknown: { label: "État indéterminé", dot: "bg-ink-muted", text: "text-ink-muted" },
};

const EXPLANATION: Record<ServerState, string> = {
  online: "Le serveur accepte les connexions.",
  starting:
    "Le serveur charge le monde et les mods. Comptez une à deux minutes, puis rafraîchissez.",
  offline: "Le serveur est arrêté. Prévenez l'administrateur si ça dure.",
  unknown:
    "Ce site n'arrive pas à interroger le serveur. Cela ne veut pas dire qu'il est arrêté : c'est la sonde qui est en défaut.",
};

export default function StatusBadge({ initial }: { initial: StatusPayload }) {
  const [status, setStatus] = useState(initial);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function refresh() {
      try {
        const response = await fetch("/api/status", { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        setStatus((await response.json()) as StatusPayload);
        setStale(false);
      } catch {
        if (!controller.signal.aborted) {
          setStale(true);
        }
      }
    }

    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, []);

  const presentation = PRESENTATION[status.state];

  return (
    <section className="border-border-subtle bg-surface-raised rounded-lg border p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`inline-block size-3 shrink-0 rounded-full ${presentation.dot}`} />
        <h2 className={`text-lg font-semibold ${presentation.text}`}>{presentation.label}</h2>
        {status.state === "online" && (
          <span className="text-ink-muted text-sm">
            {status.playerCount} / {status.maxPlayers} joueurs
          </span>
        )}
      </div>

      <p className="text-ink-muted mt-2 text-sm">{EXPLANATION[status.state]}</p>

      {status.players.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {status.players.map((name) => (
            <li
              key={name}
              className="border-border-subtle bg-surface rounded-full border px-3 py-1 text-sm"
            >
              {name}
            </li>
          ))}
        </ul>
      )}

      <dl className="text-ink-muted mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt>Version du jeu</dt>
        <dd className="text-ink font-mono">{status.gameBuild ?? "inconnue"}</dd>
      </dl>

      {stale && (
        <p className="text-starting mt-3 text-sm">
          Impossible de rafraîchir l'état. Les informations ci-dessus datent de la dernière
          réponse.
        </p>
      )}

      {status.problems.length > 0 && (
        <div className="border-offline/40 bg-offline/10 mt-4 rounded-md border p-3">
          <p className="text-offline text-sm font-medium">Configuration à corriger</p>
          <ul className="text-ink-muted mt-1 list-disc space-y-1 pl-5 text-sm">
            {status.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

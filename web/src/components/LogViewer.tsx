import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LogFilePayload } from "../shared/LogPayload";

const REFRESH_MS = 10_000;
const LINE_CHOICES = [200, 400, 1000, 2000];

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} o`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} Ko`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function LogViewer({ files }: { files: readonly LogFilePayload[] }) {
  const [file, setFile] = useState(files[0]?.name ?? "");
  const [lines, setLines] = useState(400);
  const [filter, setFilter] = useState("");
  const [follow, setFollow] = useState(true);
  const [content, setContent] = useState<readonly string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const output = useRef<HTMLPreElement>(null);

  const load = useCallback(async () => {
    if (file === "") {
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `/api/logs?file=${encodeURIComponent(file)}&lines=${lines}`,
      );
      const body = (await response.json()) as { lines?: string[]; problem?: string };
      if (!response.ok) {
        throw new Error(body.problem ?? `HTTP ${response.status}`);
      }
      setContent(body.lines ?? []);
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [file, lines]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!follow) {
      return;
    }
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [follow, load]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle === ""
      ? content
      : content.filter((line) => line.toLowerCase().includes(needle));
  }, [content, filter]);

  useEffect(() => {
    if (follow && output.current) {
      output.current.scrollTop = output.current.scrollHeight;
    }
  }, [visible, follow]);

  if (files.length === 0) {
    return (
      <p className="text-ink-muted">
        Aucun journal disponible. Le serveur n'a probablement jamais démarré sur ce volume.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={file}
          onChange={(event) => setFile(event.target.value)}
          aria-label="Fichier de journal"
          className="border-border-subtle bg-surface-raised rounded-md border px-3 py-2 text-sm"
        >
          {files.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name} — {formatSize(entry.sizeBytes)}
            </option>
          ))}
        </select>

        <select
          value={lines}
          onChange={(event) => setLines(Number(event.target.value))}
          aria-label="Nombre de lignes"
          className="border-border-subtle bg-surface-raised rounded-md border px-3 py-2 text-sm"
        >
          {LINE_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {choice} dernières lignes
            </option>
          ))}
        </select>

        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filtrer"
          aria-label="Filtrer les lignes"
          className="border-border-subtle bg-surface-raised focus:border-ink-muted min-w-40 flex-1 rounded-md border px-3 py-2 text-sm outline-none"
        />

        <label className="text-ink-muted flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={follow}
            onChange={(event) => setFollow(event.target.checked)}
          />
          Suivre
        </label>

        <button
          type="button"
          onClick={() => void load()}
          className="border-border-subtle hover:border-ink-muted cursor-pointer rounded-md border px-3 py-2 text-sm"
        >
          {loading ? "Chargement…" : "Rafraîchir"}
        </button>
      </div>

      {problem && (
        <p className="border-offline/40 bg-offline/10 text-offline mt-4 rounded-md border p-3 text-sm">
          {problem}
        </p>
      )}

      <p className="text-ink-muted mt-3 text-sm">
        {visible.length} ligne{visible.length > 1 ? "s" : ""}
        {filter.trim() !== "" && ` sur ${content.length}`}
      </p>

      <pre
        ref={output}
        className="border-border-subtle bg-surface-raised mt-2 h-[60vh] overflow-auto rounded-lg border p-4 font-mono text-xs leading-relaxed whitespace-pre"
      >
        {visible.join("\n")}
      </pre>
    </div>
  );
}

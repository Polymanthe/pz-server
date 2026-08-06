import { useMemo, useState } from "react";

import type { ModPayload } from "../shared/ModPayload";

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function ModCard({ mod }: { mod: ModPayload }) {
  return (
    <li className="border-border-subtle bg-surface-raised flex flex-col overflow-hidden rounded-lg border">
      <div className="bg-surface aspect-video w-full">
        {mod.posterUrl ? (
          <img
            src={mod.posterUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="text-ink-muted flex h-full items-center justify-center text-sm">
            sans visuel
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="leading-tight font-medium">{mod.name}</h3>
        {mod.author && <p className="text-ink-muted mt-1 text-sm">par {mod.author}</p>}
        {mod.description && (
          <p className="text-ink-muted mt-2 line-clamp-3 text-sm">{mod.description}</p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          {mod.category && (
            <span className="border-border-subtle text-ink-muted rounded-full border px-2 py-0.5 text-xs">
              {mod.category}
            </span>
          )}
          {mod.missingFiles && (
            <span className="border-offline/50 text-offline rounded-full border px-2 py-0.5 text-xs">
              fichiers absents du serveur
            </span>
          )}
          {mod.workshopUrl && (
            <a
              href={mod.workshopUrl}
              target="_blank"
              rel="noreferrer"
              className="text-ink-muted hover:text-ink ml-auto text-xs underline"
            >
              Steam Workshop
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

export default function ModGrid({ mods }: { mods: readonly ModPayload[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");

  const categories = useMemo(
    () => [...new Set(mods.map((mod) => mod.category).filter((value) => value !== null))].sort(),
    [mods],
  );

  const visible = useMemo(() => {
    const needle = normalise(query.trim());
    return mods.filter((mod) => {
      if (category !== "" && mod.category !== category) {
        return false;
      }
      if (needle === "") {
        return true;
      }
      return [mod.name, mod.id, mod.author ?? "", mod.description ?? ""].some((field) =>
        normalise(field).includes(needle),
      );
    });
  }, [mods, query, category]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un mod"
          aria-label="Rechercher un mod"
          className="border-border-subtle bg-surface-raised focus:border-ink-muted min-w-56 flex-1 rounded-md border px-3 py-2 text-sm outline-none"
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Filtrer par catégorie"
          className="border-border-subtle bg-surface-raised rounded-md border px-3 py-2 text-sm"
        >
          <option value="">Toutes les catégories</option>
          {categories.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      <p className="text-ink-muted mt-3 text-sm">
        {visible.length} mod{visible.length > 1 ? "s" : ""} affiché
        {visible.length > 1 ? "s" : ""} sur {mods.length}
      </p>

      {visible.length === 0 ? (
        <p className="text-ink-muted mt-6">Aucun mod ne correspond à cette recherche.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((mod) => (
            <ModCard key={mod.id} mod={mod} />
          ))}
        </ul>
      )}
    </div>
  );
}

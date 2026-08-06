#!/bin/sh
# Export and import the world held in the server-data volume.
#
# This runs in a container so that the volume, the archiving tools, and later a
# bucket client all live in one place: the host only needs Docker. Where an
# archive is kept is the store's business alone, see stores/.
set -eu

CONFIG_DIR=/project-zomboid-config
STAGING=/tmp/backup
MANIFEST=manifest.json
MANIFEST_FORMAT=1

server_name="${SERVER_NAME:-pzserver}"
world="Saves/Multiplayer/${server_name}"
database="db/${server_name}.db"

# This container runs as root to read and restore files owned by the game user;
# everything it creates is handed back to that user.
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

load_store() {
  store="${BACKUP_STORE:-local}"
  if [ ! -f "/opt/backup/stores/${store}.sh" ]; then
    available="$(ls /opt/backup/stores | sed 's/\.sh$//' | tr '\n' ' ')"
    fail "Unknown BACKUP_STORE '${store}'. Available stores: ${available}"
  fi
  . "/opt/backup/stores/${store}.sh"
}

export_world() {
  cd "$CONFIG_DIR"
  [ -d "$world" ] || fail "No world at ${CONFIG_DIR}/${world}. Has the server ever run with this SERVER_NAME?"
  [ -f "$database" ] || fail "No player database at ${CONFIG_DIR}/${database}"

  rm -rf "$STAGING"
  mkdir -p "$STAGING"

  jq -n \
    --argjson format "$MANIFEST_FORMAT" \
    --arg created_at "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    --arg server_name "$server_name" \
    --arg mods "${PZ_MODS:-}" \
    --arg workshop_items "${PZ_WORKSHOP_ITEMS:-}" \
    '{format: $format, created_at: $created_at, server_name: $server_name, mods: $mods, workshop_items: $workshop_items}' \
    > "${STAGING}/${MANIFEST}"

  # Project Zomboid creates backups/ on its first start. A world exported before
  # that simply travels without the game's own safety net.
  set -- "$world" "$database" Server
  if [ -d backups ]; then
    set -- "$@" backups
  fi

  name="${server_name}-$(date -u '+%Y%m%dT%H%M%SZ').tar.gz"
  tar -czf "${STAGING}/${name}" -C "$STAGING" "$MANIFEST" -C "$CONFIG_DIR" "$@"

  location="$(store_put "${STAGING}/${name}" "$name")"
  rm -rf "$STAGING"

  printf 'Archived %s\n' "$*"
  printf 'Exported %s to %s\n' "$name" "$location"
  printf 'The .env file is not part of the archive: copy it separately.\n'
}

import_world() {
  name="${1:-}"
  [ -n "$name" ] || fail 'Provide an archive name, as shown by task backup:list'

  rm -rf "$STAGING"
  mkdir -p "$STAGING"
  archive="$(store_fetch "$name" "$STAGING")"

  manifest="$(tar -xzOf "$archive" "$MANIFEST" 2>/dev/null)" \
    || fail "${name} has no ${MANIFEST}: it is not a world archive"

  format="$(printf '%s' "$manifest" | jq -r '.format')"
  [ "$format" = "$MANIFEST_FORMAT" ] \
    || fail "${name} uses manifest format ${format}, this version reads ${MANIFEST_FORMAT}"

  # The world directory and the database file are both named after the server,
  # so restoring under another name would produce a volume the server cannot
  # see. Renaming a world is not supported.
  archived_server="$(printf '%s' "$manifest" | jq -r '.server_name')"
  [ "$archived_server" = "$server_name" ] \
    || fail "${name} holds the world of '${archived_server}' but SERVER_NAME is '${server_name}'. Align SERVER_NAME in .env with the archive."

  archived_mods="$(printf '%s' "$manifest" | jq -r '.mods')"
  archived_items="$(printf '%s' "$manifest" | jq -r '.workshop_items')"
  if [ "$archived_mods" != "${PZ_MODS:-}" ] || [ "$archived_items" != "${PZ_WORKSHOP_ITEMS:-}" ]; then
    printf 'Warning: this archive was taken with a different mod pack than the one currently resolved.\n' >&2
    printf 'Run task mods:diff before starting the server.\n' >&2
  fi

  cd "$CONFIG_DIR"
  if [ -e "$world" ] || [ -e "$database" ]; then
    [ "${REPLACE:-}" = world ] \
      || fail "A world for ${server_name} already exists in this volume. Add REPLACE=world to overwrite it."
    rm -rf -- "$world" "$database"
    printf 'Removed the existing world for %s\n' "$server_name"
  fi

  tar -xzf "$archive" --exclude "$MANIFEST" -C "$CONFIG_DIR"
  for entry in Saves db Server backups; do
    if [ -e "$entry" ]; then
      chown -R "$PUID:$PGID" "$entry"
    fi
  done
  rm -rf "$STAGING"

  printf 'Imported %s. Run task up to start the server.\n' "$name"
}

load_store

case "${1:-}" in
  export)
    export_world
    ;;
  import)
    shift
    import_world "${1:-}"
    ;;
  list)
    listing="$(store_list)"
    if [ -z "$listing" ]; then
      printf 'No archive yet. Run task backup:export first.\n'
    else
      printf '%s\n' "$listing"
    fi
    ;;
  *)
    fail 'Usage: export | import <archive> | list'
    ;;
esac

#!/bin/sh
# Archives kept in a directory on the host, bind mounted at /backups.
#
# A store only ever handles a finished archive file. Adding a bucket means
# adding a sibling of this file that implements the same three functions, plus
# its client in the Dockerfile. Nothing in entrypoint.sh changes.

BACKUP_MOUNT=/backups

# store_put <archive> <name> -> prints the resulting location
store_put() {
  archive="$1"
  name="$2"

  mkdir -p "$BACKUP_MOUNT"
  if [ -e "$BACKUP_MOUNT/$name" ]; then
    printf 'An archive named %s already exists in %s\n' "$name" "$BACKUP_MOUNT" >&2
    return 1
  fi

  mv "$archive" "$BACKUP_MOUNT/$name"
  chown "$PUID:$PGID" "$BACKUP_MOUNT/$name"
  printf '%s\n' "$BACKUP_MOUNT/$name"
}

# store_fetch <name> <destination directory> -> prints the local archive path
store_fetch() {
  name="$1"
  destination="$2"

  if [ ! -f "$BACKUP_MOUNT/$name" ]; then
    printf 'No archive named %s in %s\n' "$name" "$BACKUP_MOUNT" >&2
    return 1
  fi

  mkdir -p "$destination"
  cp "$BACKUP_MOUNT/$name" "$destination/$name"
  printf '%s\n' "$destination/$name"
}

# store_list -> one line per archive, most recent first
store_list() {
  [ -d "$BACKUP_MOUNT" ] || return 0

  for path in "$BACKUP_MOUNT"/*.tar.gz; do
    [ -f "$path" ] || continue
    printf '%-44s %8s  %s\n' \
      "$(basename "$path")" \
      "$(du -h "$path" | cut -f1)" \
      "$(date -r "$path" '+%Y-%m-%d %H:%M')"
  done | sort -r
}

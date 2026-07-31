#!/usr/bin/env bash
set -Eeuo pipefail

server_name="${SERVER_NAME:-pzserver}"
config_dir="/project-zomboid-config/Server"
config_file="${config_dir}/${server_name}.ini"
temp_file="${config_dir}/.${server_name}.ini.tmp"

mkdir -p "$config_dir"

input_file="$config_file"
if [ ! -f "$input_file" ]; then
  input_file=/dev/null
fi

awk \
  -v mods="${PZ_MODS:-}" \
  -v workshop_items="${PZ_WORKSHOP_ITEMS:-}" \
  -v public_server="${PUBLIC_SERVER:-false}" \
  '
  /^Mods=/ {
    print "Mods=" mods
    has_mods = 1
    next
  }
  /^WorkshopItems=/ {
    print "WorkshopItems=" workshop_items
    has_workshop_items = 1
    next
  }
  /^Public=/ {
    print "Public=" public_server
    has_public_server = 1
    next
  }
  { print }
  END {
    if (!has_mods) print "Mods=" mods
    if (!has_workshop_items) print "WorkshopItems=" workshop_items
    if (!has_public_server) print "Public=" public_server
  }
  ' "$input_file" > "$temp_file"

mv "$temp_file" "$config_file"

printf 'Configured %s Workshop items, %s mod IDs, and Public=%s for %s\n' \
  "$(tr ';' '\n' <<<"${PZ_WORKSHOP_ITEMS:-}" | awk 'NF { count++ } END { print count + 0 }')" \
  "$(tr ';' '\n' <<<"${PZ_MODS:-}" | awk 'NF { count++ } END { print count + 0 }')" \
  "${PUBLIC_SERVER:-false}" \
  "$server_name"

exec /home/steam/server/init.sh

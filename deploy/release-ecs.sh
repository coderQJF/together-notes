#!/usr/bin/env sh
set -eu

archive="${1:?release archive is required}"
release_id="${2:?release id is required}"
app_root="/opt/together-notes"
release_dir="$app_root/releases/$release_id"
previous=""

printf '%s' "$release_id" | grep -Eq '^[0-9a-f]{7,40}$' || {
  echo "invalid release id" >&2
  exit 1
}
test -f "$archive"
test -f "$app_root/shared/server.env"

if [ -L "$app_root/current" ]; then
  previous="$(readlink -f "$app_root/current")"
  set -a
  . "$app_root/shared/server.env"
  set +a
  /opt/node-v24/bin/node "$previous/server/backup.mjs"
fi

rm -rf "$release_dir"
install -d -m 755 "$release_dir"
tar -xzf "$archive" --no-same-owner -C "$release_dir"

nginx_template="$release_dir/deploy/nginx-notes.conf"
nginx_body_limit="$(awk '/^[[:space:]]*client_max_body_size[[:space:]]+/ { value=$2; sub(/;$/, "", value); print value; exit }' "$nginx_template")"
printf '%s' "$nginx_body_limit" | grep -Eq '^[1-9][0-9]*[mM]$' || {
  echo "invalid Nginx upload limit" >&2
  exit 1
}
nginx_config="$(
  grep -Rsl 'server_name[[:space:]][^;]*notes\.coder-f-nowork\.cn' \
    /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -n 1
)"
test -n "$nginx_config" || {
  echo "active Together Notes Nginx config was not found" >&2
  exit 1
}
nginx_config="$(readlink -f "$nginx_config")"
test -f "$nginx_config"
nginx_backup="$(mktemp)"
cp -p "$nginx_config" "$nginx_backup"
if grep -Eq '^[[:space:]]*client_max_body_size[[:space:]]+[^;]+;' "$nginx_config"; then
  sed -i -E "s/^([[:space:]]*)client_max_body_size[[:space:]]+[^;]+;/\\1client_max_body_size $nginx_body_limit;/" "$nginx_config"
else
  sed -i "/server_name[[:space:]][^;]*notes\\.coder-f-nowork\\.cn/a\\    client_max_body_size $nginx_body_limit;" "$nginx_config"
fi
if ! nginx -t || ! systemctl reload nginx; then
  cp -p "$nginx_backup" "$nginx_config"
  nginx -t && systemctl reload nginx || true
  rm -f "$nginx_backup"
  echo "Nginx upload limit update failed; previous config restored" >&2
  exit 1
fi
rm -f "$nginx_backup"

ln -sfn "$release_dir" "$app_root/current.next"
mv -Tf "$app_root/current.next" "$app_root/current"

systemctl restart together-notes.service
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8787/api/health >/dev/null; then
    rm -f "$archive"
    find "$app_root/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
      | sort -nr | awk 'NR > 5 { sub(/^[^ ]+ /, ""); print }' \
      | while IFS= read -r old_release; do rm -rf "$old_release"; done
    echo "release $release_id is healthy"
    exit 0
  fi
  sleep 2
done

journalctl -u together-notes.service -n 100 --no-pager >&2 || true
if [ -n "$previous" ] && [ -d "$previous" ]; then
  ln -sfn "$previous" "$app_root/current.next"
  mv -Tf "$app_root/current.next" "$app_root/current"
  systemctl restart together-notes.service
  echo "release failed; rolled back to $previous" >&2
fi
exit 1

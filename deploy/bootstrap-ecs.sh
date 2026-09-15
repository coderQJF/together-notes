#!/usr/bin/env sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "bootstrap-ecs.sh must run as root" >&2
  exit 1
fi

node_version="${NODE_VERSION:-24.19.0}"
node_archive="node-v${node_version}-linux-x64.tar.xz"
node_url="https://npmmirror.com/mirrors/node/v${node_version}"
install_dir="/opt/node-v${node_version}"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

if [ ! -x "$install_dir/bin/node" ]; then
  curl -fsSL "$node_url/$node_archive" -o "$temp_dir/$node_archive"
  curl -fsSL "$node_url/SHASUMS256.txt" -o "$temp_dir/SHASUMS256.txt"
  expected="$(awk -v file="$node_archive" '$2 == file { print $1 }' "$temp_dir/SHASUMS256.txt")"
  test -n "$expected"
  printf '%s  %s\n' "$expected" "$temp_dir/$node_archive" | sha256sum -c -
  mkdir -p "$install_dir"
  tar -xJf "$temp_dir/$node_archive" --strip-components=1 -C "$install_dir"
fi

ln -sfn "$install_dir" /opt/node-v24
id together-notes >/dev/null 2>&1 || useradd --system --home /nonexistent --shell /usr/sbin/nologin together-notes
install -d -m 755 /opt/together-notes/releases /opt/together-notes/shared
install -d -o together-notes -g together-notes -m 750 /var/lib/together-notes /var/lib/together-notes/backups
install -m 644 /opt/together-notes/deploy/together-notes.service /etc/systemd/system/together-notes.service
systemctl daemon-reload
systemctl enable together-notes.service
/opt/node-v24/bin/node --version

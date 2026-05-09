#!/usr/bin/env bash
set -euo pipefail

app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$app_dir"

date_stamp="$(date +%Y-%m-%d)"
zip_name="${date_stamp}.chat-mini.zip"
stage_dir="$(mktemp -d)"
trap 'rm -rf "$stage_dir"' EXIT

echo "==> Building chat-mini.app"
pnpm build

if [[ ! -f dist/index.html ]]; then
  echo "ERROR: build did not produce dist/index.html" >&2
  exit 1
fi

echo "==> Staging release contents in $stage_dir"
cp -R dist "$stage_dir/dist"

cat > "$stage_dir/start.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Download and install Deno if not installed:
if ! command -v deno >/dev/null 2>&1; then
  curl -fsSL https://deno.land/install.sh | sh
  export DENO_INSTALL="${DENO_INSTALL:-$HOME/.deno}"
  export PATH="$DENO_INSTALL/bin:$PATH"
fi

# Start http server (serves the bundled dist/ directory as static files)
app_dir=./dist
deno run -N -R jsr:@std/http/file-server "$app_dir"
EOF
chmod +x "$stage_dir/start.sh"

echo "==> Creating $zip_name"
rm -f "$app_dir/$zip_name"
( cd "$stage_dir" && zip -rq "$app_dir/$zip_name" dist start.sh )

echo "==> Done: $app_dir/$zip_name"

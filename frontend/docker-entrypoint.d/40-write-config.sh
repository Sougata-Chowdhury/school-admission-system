#!/bin/sh
set -eu

# The official nginx entrypoint runs every executable script in this directory
# before starting nginx. Write the backend URL supplied by docker-compose into a
# tiny runtime config file, so the same built image can target any backend.
API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:8080}"
API_BASE_URL_ESCAPED=$(printf '%s' "$API_BASE_URL" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = { apiBaseUrl: "${API_BASE_URL_ESCAPED}" };
EOF

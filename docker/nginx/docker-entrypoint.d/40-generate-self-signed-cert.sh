#!/bin/sh
# Generate a self-signed TLS certificate when none is mounted.
#
# Runs as part of nginx's docker-entrypoint.d startup scripts. With a mounted
# certificate pair (docker/certs/fullchain.pem + privkey.pem) this is a no-op.
set -e

CERT_DIR=/etc/nginx/certs

if [ -f "$CERT_DIR/fullchain.pem" ] && [ -f "$CERT_DIR/privkey.pem" ]; then
  echo "$0: mounted TLS certificates found, skipping self-signed generation"
  exit 0
fi

CN="${TLS_SELF_SIGNED_CN:-localhost}"

mkdir -p "$CERT_DIR"

echo "$0: no mounted TLS certificates found — generating a self-signed certificate for '$CN'."
echo "$0: browsers will show a warning for it; mount your own fullchain.pem and privkey.pem in docker/certs/ for production."

openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout "$CERT_DIR/privkey.pem" \
  -out "$CERT_DIR/fullchain.pem" \
  -subj "/CN=${CN}" \
  -addext "subjectAltName=DNS:${CN},DNS:localhost,IP:127.0.0.1"

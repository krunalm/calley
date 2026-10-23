# Calley's bundled reverse proxy.
#
# nginx normally refuses to start with `listen 443 ssl` and no certificate
# files, which forced every self-hosted deployment to hand-edit nginx.conf
# before HTTPS worked at all. This image generates a self-signed certificate
# at startup when none is mounted, so the stack is TLS-protected out of the
# box; mount real certificates in docker/certs/ for production.
FROM nginx:alpine

RUN apk add --no-cache openssl

COPY nginx.conf /etc/nginx/nginx.conf
COPY docker-entrypoint.d/40-generate-self-signed-cert.sh /docker-entrypoint.d/40-generate-self-signed-cert.sh
RUN chmod +x /docker-entrypoint.d/40-generate-self-signed-cert.sh

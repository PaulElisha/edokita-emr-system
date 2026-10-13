# @format
# Fallback image for Render. Use ONLY if deploying the plain pinned image fails
# with "No open ports detected" and/or Aiven DB authentication errors.
#
# It does two things on top of the stock OpenEMR image:
#   1. Places the Aiven project CA onto the persisted sites volume at
#      sites/default/documents/certificates/mysql-ca, so OpenEMR's PHP layer
#      connects to MySQL 8.4 over TLS (avoids caching_sha2_password-over-
#      plaintext issues). The CA is read from the Render Secret File mounted at
#      /etc/secrets/mysql-ca (add it in the Render Dashboard).
#   2. Proxies Render's $PORT -> localhost:80 so Render's port scanner finds
#      OpenEMR's Apache listener.
#
# In render.yaml, swap:
#   runtime: image
#   image: { url: ... }
# for:
#   runtime: docker
#   dockerfilePath: ./deploy/openemr/Dockerfile

FROM openemr/openemr@sha256:086c92c5d94b112fb917763dde6c2bcb86cdddc5c562085b32c528e73ea514e2

USER root
RUN apk add --no-cache socat

CMD ["sh", "-c", "\
  mkdir -p /var/www/localhost/htdocs/openemr/sites/default/documents/certificates && \
  if [ -f /etc/secrets/mysql-ca ]; then \
    cp -f /etc/secrets/mysql-ca /var/www/localhost/htdocs/openemr/sites/default/documents/certificates/mysql-ca; \
    echo 'OpenEMR: installed Aiven CA for TLS DB connection'; \
  fi && \
  if [ \"${PORT:-80}\" != \"80\" ]; then \
    socat TCP-LISTEN:${PORT},fork,reuseaddr TCP:127.0.0.1:80 & \
    echo \"OpenEMR: proxying port ${PORT} -> 80\"; \
  fi && \
  exec ./openemr.sh"]

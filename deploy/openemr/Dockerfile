# @format
# Render image for OpenEMR. Required (not just a fallback) because Render disks
# start TRULY empty, whereas Docker seeds a brand-new named volume with the
# image's content at the mount point. With nothing in sites/, the stock
# entrypoint reads sites/default/docker-version as 0 and dies with
# "Upgrade detected: 0 -> 15 ... Cannot upgrade - OpenEMR is not configured yet".
#
# This image:
#   1. Seeds an empty sites disk from /swarm-pieces/sites (the image's bundled
#      pristine default site, docker-version = 15), which puts the entrypoint
#      back on the fresh-install path. Idempotent: skipped when the marker
#      already exists. On a later image upgrade the marker stays and OpenEMR's
#      normal upgrade path still runs.
#   2. Places the Aiven project CA onto the persisted sites volume at
#      sites/default/documents/certificates/mysql-ca, so OpenEMR's PHP layer
#      connects to MySQL 8.4 over TLS (avoids caching_sha2_password-over-
#      plaintext issues). The CA is read from the Render Secret File mounted at
#      /etc/secrets/mysql-ca (add it in the Render Dashboard).
#   3. Proxies Render's $PORT -> localhost:80 so Render's port scanner finds
#      OpenEMR's Apache listener.
#
# render.yaml is wired to build this via runtime: docker.

FROM openemr/openemr@sha256:086c92c5d94b112fb917763dde6c2bcb86cdddc5c562085b32c528e73ea514e2

USER root
RUN apk add --no-cache socat

CMD ["sh", "-c", "\
  SITES=/var/www/localhost/htdocs/openemr/sites && \
  if [ ! -f \"$SITES/default/docker-version\" ]; then \
    echo 'OpenEMR: seeding empty sites disk from image defaults'; \
    mkdir -p \"$SITES\" && \
    cp -a /swarm-pieces/sites/. \"$SITES/\" && \
    chown -R apache:apache \"$SITES\"; \
  fi && \
  mkdir -p \"$SITES/default/documents/certificates\" && \
  if [ -f /etc/secrets/mysql-ca ]; then \
    cp -f /etc/secrets/mysql-ca \"$SITES/default/documents/certificates/mysql-ca\"; \
    echo 'OpenEMR: installed Aiven CA for TLS DB connection'; \
  fi && \
  if [ \"${PORT:-80}\" != \"80\" ]; then \
    socat TCP-LISTEN:${PORT},fork,reuseaddr TCP:127.0.0.1:80 & \
    echo \"OpenEMR: proxying port ${PORT} -> 80\"; \
  fi && \
  exec ./openemr.sh"]
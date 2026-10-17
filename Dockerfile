# @format
# E-Dokita OpenEMR image: base OpenEMR plus the lab API extension.
#
# How the extension is layered:
#   - NEW files (services/controllers OpenEMR does not ship) are copied in.
#   - PATCHES against upstream CORE files are applied at build time, so an
#     OpenEMR version bump only needs the patches re-generated/validated
#     (see openemr/regenerate-patches.sh) instead of shipping frozen copies
#     of whole core files.
#
# The base is pinned to the exact digest currently deployed (OpenEMR 8.4.1).
FROM openemr/openemr:latest@sha256:086c92c5d94b112fb917763dde6c2bcb86cdddc5c562085b32c528e73ea514e2

# New files that do not collide with upstream.
COPY openemr/src/Services/LabService.php /var/www/localhost/htdocs/openemr/src/Services/LabService.php
COPY openemr/src/RestControllers/LabRestController.php /var/www/localhost/htdocs/openemr/src/RestControllers/LabRestController.php

# Apply patches against upstream core files with `git apply` (already present in
# the base image; avoids an apk fetch at build). A failed patch aborts the
# build (set -e: git apply is atomic, it will not leave a half-applied tree).
COPY openemr/patches /tmp/edokita-patches
RUN set -eux; \
    git config --global --add safe.directory '*'; \
    cd /var/www/localhost/htdocs/openemr; \
    for p in /tmp/edokita-patches/*.patch; do \
      echo "Applying ${p}"; \
      git apply -p1 --whitespace=nowarn "${p}"; \
    done; \
    rm -rf /tmp/edokita-patches

# The bundled MariaDB 11.8 CLI requires TLS by default while the local
# mariadb:10.11 service has SSL disabled; disable TLS for CLI clients so the
# entrypoint readiness check can connect.
COPY docker/my.cnf.d/zz-edokita.cnf /etc/my.cnf.d/zz-edokita.cnf

RUN chown -R apache:apache \
      /var/www/localhost/htdocs/openemr/apis/routes \
      /var/www/localhost/htdocs/openemr/src/Services \
      /var/www/localhost/htdocs/openemr/src/RestControllers \
      /var/www/localhost/htdocs/openemr/src/Common/Auth/OpenIDConnect/Entities \
 && find \
      /var/www/localhost/htdocs/openemr/apis/routes \
      /var/www/localhost/htdocs/openemr/src/Services \
      /var/www/localhost/htdocs/openemr/src/RestControllers \
      /var/www/localhost/htdocs/openemr/src/Common/Auth/OpenIDConnect/Entities \
      -type f -exec chmod 0400 {} +

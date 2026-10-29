FROM openemr/openemr:latest@sha256:086c92c5d94b112fb917763dde6c2bcb86cdddc5c562085b32c528e73ea514e2

COPY openemr/src/Services/LabService.php /var/www/localhost/htdocs/openemr/src/Services/LabService.php
COPY openemr/src/RestControllers/LabRestController.php /var/www/localhost/htdocs/openemr/src/RestControllers/LabRestController.php
COPY openemr/src/Services/ClinicalObservationService.php /var/www/localhost/htdocs/openemr/src/Services/ClinicalObservationService.php
COPY openemr/src/RestControllers/ObservationRestController.php /var/www/localhost/htdocs/openemr/src/RestControllers/ObservationRestController.php

COPY openemr/patches /tmp/edokita-patches
RUN set -eux; \
    git config --global --add safe.directory '*'; \
    cd /var/www/localhost/htdocs/openemr; \
    for p in /tmp/edokita-patches/*.patch; do \
      echo "Applying ${p}"; \
      git apply -p1 --whitespace=nowarn "${p}"; \
    done; \
    rm -rf /tmp/edokita-patches

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

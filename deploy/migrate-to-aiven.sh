#!/usr/bin/env bash
# @format
# =============================================================================
# Migrate the local OpenEMR database into the Aiven MySQL that backs the
# Render-hosted OpenEMR service.
#
# IMPORTANT - run this AFTER the Render `openemr` service has completed its
# first boot. That first boot auto-installs the OpenEMR schema into Aiven and
# writes sites/default/sqlconf.php onto the Render disk. This script then
# replaces that (near-empty) schema with your real data, preserving the OAuth
# client, scopes and admin password.
#
# Usage:
#   AIVEN_ROOT_PASS='<avnadmin password>' ./deploy/migrate-to-aiven.sh
#
# Optional overrides:
#   AIVEN_HOST, AIVEN_PORT, AIVEN_ROOT_USER, AIVEN_DB, DUMP, MYSQL_IMAGE
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

AIVEN_HOST="${AIVEN_HOST:-mysql-1bc79121-ireajao-9f74.j.aivencloud.com}"
AIVEN_PORT="${AIVEN_PORT:-25562}"
AIVEN_ROOT_USER="${AIVEN_ROOT_USER:-avnadmin}"
AIVEN_DB="${AIVEN_DB:-openemr}"
: "${AIVEN_ROOT_PASS:?set AIVEN_ROOT_PASS to the avnadmin password}"

CA_FILE="${CA_FILE:-$REPO_ROOT/certs/ca.pem}"
DUMP="${DUMP:-/tmp/openemr_local.sql}"
MYSQL_IMAGE="${MYSQL_IMAGE:-mysql:8}"

DUMP_CONTAINER="e-dokitaemrsystem-mysql-1"

if [[ ! -f "$CA_FILE" ]]; then
  echo "ERROR: CA file not found at $CA_FILE" >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# 1. Dump the local database (refresh if the file is absent)
# -----------------------------------------------------------------------------
if [[ ! -s "$DUMP" ]]; then
  echo "==> Dumping local OpenEMR database from $DUMP_CONTAINER ..."
  docker exec "$DUMP_CONTAINER" mariadb-dump \
    -uroot -proot --single-transaction --routines --triggers --hex-blob \
    --skip-lock-tables openemr > "$DUMP"
fi
echo "==> Using dump: $DUMP ($(du -h "$DUMP" | cut -f1))"

# -----------------------------------------------------------------------------
# 2. Verify the Aiven connection (TLS) before touching anything
# -----------------------------------------------------------------------------
echo "==> Verifying TLS connection to Aiven ..."
docker run --rm -i \
  -v "$CA_FILE:/certs/ca.pem:ro" \
  "$MYSQL_IMAGE" \
  mysql --host="$AIVEN_HOST" --port="$AIVEN_PORT" \
        --user="$AIVEN_ROOT_USER" --password="$AIVEN_ROOT_PASS" \
        --ssl-mode=VERIFY_CA --ssl-ca=/certs/ca.pem \
        -e "SELECT VERSION() AS aiven_version, DATABASE() AS current_db;" "$AIVEN_DB"

# -----------------------------------------------------------------------------
# 3. Import the dump (replaces tables; keeps the database itself)
# -----------------------------------------------------------------------------
echo "==> Importing $DUMP into $AIVEN_DB ..."
docker run --rm -i \
  -v "$CA_FILE:/certs/ca.pem:ro" \
  -v "$DUMP:/dump.sql:ro" \
  "$MYSQL_IMAGE" \
  sh -c "mysql --host='$AIVEN_HOST' --port='$AIVEN_PORT' \
        --user='$AIVEN_ROOT_USER' --password='$AIVEN_ROOT_PASS' \
        --ssl-mode=VERIFY_CA --ssl-ca=/certs/ca.pem '$AIVEN_DB' < /dump.sql"

echo "==> Row counts:"
docker run --rm -i \
  -v "$CA_FILE:/certs/ca.pem:ro" \
  "$MYSQL_IMAGE" \
  mysql --host="$AIVEN_HOST" --port="$AIVEN_PORT" \
        --user="$AIVEN_ROOT_USER" --password="$AIVEN_ROOT_PASS" \
        --ssl-mode=VERIFY_CA --ssl-ca=/certs/ca.pem \
        -e "SELECT COUNT(*) AS patients FROM patient_data; SELECT COUNT(*) AS users FROM users;" "$AIVEN_DB"

# -----------------------------------------------------------------------------
# 4. Extract site documents for upload to the Render disk
# -----------------------------------------------------------------------------
DOCS_SRC="$REPO_ROOT/deploy/documents"
echo "==> Extracting site documents to $DOCS_SRC ..."
rm -rf "$DOCS_SRC"
docker cp "e-dokitaemrsystem-openemr-1:/var/www/localhost/htdocs/openemr/sites/default/documents" "$DOCS_SRC"

echo
echo "==> Database migration complete."
echo "==> Documents extracted to: $DOCS_SRC"
echo "    Upload them into the Render openemr disk at:"
echo "      sites/default/documents/"
echo "    (Render Dashboard > openemr > Shell, then scp, OR re-upload via the OpenEMR UI)"

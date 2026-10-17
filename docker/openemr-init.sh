#!/bin/sh
# @format
#
# Idempotently ensure the deployed OpenEMR OAuth client is registered for the
# scopes the E-Dokita lab API needs.
#
# OpenEMR silently drops requested scopes that are not in the client's
# registered ceiling (oauth_clients.scope); the lab routes then fail with a
# 401/"scope not in access token". The client itself is registered by hand in
# the OpenEMR admin UI (see docs/OPENEMR.md), so this only reconciles its
# scope list and is safe to run repeatedly.
#
# Runs as a one-shot compose service (profile "init"). The client row must
# exist first, so it waits - bounded - for an admin to register it.
set -eu

host="${MYSQL_HOST:-mysql}"
db="${MYSQL_DATABASE:-openemr}"
root_pw="${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required}"
client="${OPENEMR_CLIENT_ID:?OPENEMR_CLIENT_ID is required}"

required_scopes="user/lab_order.crus user/lab_result.crus"

query() { mysql -h "$host" -uroot -p"$root_pw" -N -B "$db" -e "$1"; }

echo "Waiting for OpenEMR OAuth client ${client} in ${db}..."
i=0
until query "SELECT 1 FROM oauth_clients WHERE client_id='${client}' LIMIT 1" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "Timed out waiting for client ${client}; register it in the OpenEMR admin UI first." >&2
    exit 1
  fi
  sleep 5
done

for scope in $required_scopes; do
  query "UPDATE oauth_clients SET scope = CONCAT(TRIM(scope), ' ${scope}') \
         WHERE client_id='${client}' AND scope NOT LIKE '%${scope}%'"
  echo "Ensured scope ${scope}"
done

echo "OpenEMR OAuth scopes are up to date."

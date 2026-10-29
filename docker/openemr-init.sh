#!/bin/sh
set -eu

host="${MYSQL_HOST:-mysql}"
db="${MYSQL_DATABASE:-openemr}"
root_pw="${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required}"
client="${OPENEMR_CLIENT_ID:?OPENEMR_CLIENT_ID is required}"

required_scopes="user/lab_order.crus user/lab_result.crus user/observation.cruds user/observation.rs patient/observation.rs"

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

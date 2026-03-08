#!/bin/bash
set -e

# Set proper permissions for SSL certificates
if [ -f /certs/key.pem ]; then
  chmod 600 /certs/key.pem
  chown postgres:postgres /certs/key.pem
  echo "✓ PostgreSQL SSL configured"
fi

# Grant all privileges on public schema to wellness user
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    GRANT ALL ON SCHEMA public TO wellness;
    GRANT ALL PRIVILEGES ON DATABASE wellness_db TO wellness;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO wellness;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO wellness;
EOSQL

echo "✓ PostgreSQL permissions configured for wellness user"

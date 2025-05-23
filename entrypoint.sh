#!/bin/sh
set -e

export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Wait for PostgreSQL to be available
until PGPASSWORD=$DB_PASSWORD psql -p $DB_PORT -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c '\q'; do
  echo "PostgreSQL not ready, waiting..."
  sleep 2
done

# Run Prisma db push
npx prisma db push

# Run Prisma generate
SKIP_PRISMA_VERSION_CHECK=true npx prisma generate

# Start the application
yarn start

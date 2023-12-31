#!/bin/sh
set -e

DB_HOST=$(echo $DATABASE_URL | cut -d'@' -f2 | cut -d':' -f1)
DB_USER=$(echo $DATABASE_URL | cut -d'/' -f3 | cut -d':' -f1)
DB_PASSWORD=$(echo $DATABASE_URL | cut -d'@' -f1 | cut -d':' -f3 | cut -d'/' -f3)
DB_NAME=$(echo $DATABASE_URL | cut -d'/' -f4)


# Wait for PostgreSQL to be available
until PGPASSWORD=$DB_PASSWORD psql -p 5432 -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c '\q'; do
  echo "PostgreSQL not ready, waiting..."
  sleep 2
done

# Run Prisma db push
npx prisma db push

# Run Prisma generate
SKIP_PRISMA_VERSION_CHECK=true npx prisma generate

# Start the application
yarn start

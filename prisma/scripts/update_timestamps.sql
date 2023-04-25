BEGIN;
-- Schema
ALTER TABLE "Schema" ADD COLUMN "time_new" INTEGER;
UPDATE "Schema" SET "time_new" = CAST("time" AS integer);
ALTER TABLE "Schema" DROP COLUMN "time";
ALTER TABLE "Schema" RENAME COLUMN "time_new" TO "time";

-- Attestation
ALTER TABLE "Attestation" ADD COLUMN "time_new" INTEGER;
UPDATE "Attestation" SET "time_new" = CAST("time" AS integer);
ALTER TABLE "Attestation" DROP COLUMN "time";
ALTER TABLE "Attestation" RENAME COLUMN "time_new" TO "time";

ALTER TABLE "Attestation" ADD COLUMN "timeCreated_new" INTEGER;
UPDATE "Attestation" SET "timeCreated_new" = CAST("timeCreated" AS integer);
ALTER TABLE "Attestation" DROP COLUMN "timeCreated";
ALTER TABLE "Attestation" RENAME COLUMN "timeCreated_new" TO "timeCreated";

ALTER TABLE "Attestation" ADD COLUMN "expirationTime_new" INTEGER;
UPDATE "Attestation" SET "expirationTime_new" = CAST("expirationTime" AS integer);
ALTER TABLE "Attestation" DROP COLUMN "expirationTime";
ALTER TABLE "Attestation" RENAME COLUMN "expirationTime_new" TO "expirationTime";

ALTER TABLE "Attestation" ADD COLUMN "revocationTime_new" INTEGER;
UPDATE "Attestation" SET "revocationTime_new" = CAST("revocationTime" AS integer);
ALTER TABLE "Attestation" DROP COLUMN "revocationTime";
ALTER TABLE "Attestation" RENAME COLUMN "revocationTime_new" TO "revocationTime";

-- SchemaName
ALTER TABLE "SchemaName" ADD COLUMN "time_new" INTEGER;
UPDATE "SchemaName" SET "time_new" = CAST("time" AS integer);
ALTER TABLE "SchemaName" DROP COLUMN "time";
ALTER TABLE "SchemaName" RENAME COLUMN "time_new" TO "time";

COMMIT;

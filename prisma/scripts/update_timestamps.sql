BEGIN;
-- Schema
ALTER TABLE "eas-sepolia"."Schema" ADD COLUMN "time_new" INTEGER;
UPDATE "eas-sepolia"."Schema" SET "time_new" = CAST("time" AS integer);
ALTER TABLE "eas-sepolia"."Schema" DROP COLUMN "time";
ALTER TABLE "eas-sepolia"."Schema" RENAME COLUMN "time_new" TO "time";

-- Attestation
ALTER TABLE "eas-sepolia"."Attestation" ADD COLUMN "time_new" INTEGER;
UPDATE "eas-sepolia"."Attestation" SET "time_new" = CAST("time" AS integer);
ALTER TABLE "eas-sepolia"."Attestation" DROP COLUMN "time";
ALTER TABLE "eas-sepolia"."Attestation" RENAME COLUMN "time_new" TO "time";

ALTER TABLE "eas-sepolia"."Attestation" ADD COLUMN "timeCreated_new" INTEGER;
UPDATE "eas-sepolia"."Attestation" SET "timeCreated_new" = CAST("timeCreated" AS integer);
ALTER TABLE "eas-sepolia"."Attestation" DROP COLUMN "timeCreated";
ALTER TABLE "eas-sepolia"."Attestation" RENAME COLUMN "timeCreated_new" TO "timeCreated";

ALTER TABLE "eas-sepolia"."Attestation" ADD COLUMN "expirationTime_new" INTEGER;
UPDATE "eas-sepolia"."Attestation" SET "expirationTime_new" = CAST("expirationTime" AS integer);
ALTER TABLE "eas-sepolia"."Attestation" DROP COLUMN "expirationTime";
ALTER TABLE "eas-sepolia"."Attestation" RENAME COLUMN "expirationTime_new" TO "expirationTime";

ALTER TABLE "eas-sepolia"."Attestation" ADD COLUMN "revocationTime_new" INTEGER;
UPDATE "eas-sepolia"."Attestation" SET "revocationTime_new" = CAST("revocationTime" AS integer);
ALTER TABLE "eas-sepolia"."Attestation" DROP COLUMN "revocationTime";
ALTER TABLE "eas-sepolia"."Attestation" RENAME COLUMN "revocationTime_new" TO "revocationTime";

-- SchemaName
ALTER TABLE "eas-sepolia"."SchemaName" ADD COLUMN "time_new" INTEGER;
UPDATE "eas-sepolia"."SchemaName" SET "time_new" = CAST("time" AS integer);
ALTER TABLE "eas-sepolia"."SchemaName" DROP COLUMN "time";
ALTER TABLE "eas-sepolia"."SchemaName" RENAME COLUMN "time_new" TO "time";

COMMIT;

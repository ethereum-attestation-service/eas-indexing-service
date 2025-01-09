BEGIN;
-- Schema
ALTER TABLE "eeas-rootstock-testnet"."Schema" ADD COLUMN "time_new" INTEGER;
UPDATE "eeas-rootstock-testnet"."Schema" SET "time_new" = CAST("time" AS integer);
ALTER TABLE "eeas-rootstock-testnet"."Schema" DROP COLUMN "time";
ALTER TABLE "eeas-rootstock-testnet"."Schema" RENAME COLUMN "time_new" TO "time";

-- Attestation
ALTER TABLE "eeas-rootstock-testnet"."Attestation" ADD COLUMN "time_new" INTEGER;
UPDATE "eeas-rootstock-testnet"."Attestation" SET "time_new" = CAST("time" AS integer);
ALTER TABLE "eeas-rootstock-testnet"."Attestation" DROP COLUMN "time";
ALTER TABLE "eeas-rootstock-testnet"."Attestation" RENAME COLUMN "time_new" TO "time";

ALTER TABLE "eeas-rootstock-testnet"."Attestation" ADD COLUMN "timeCreated_new" INTEGER;
UPDATE "eeas-rootstock-testnet"."Attestation" SET "timeCreated_new" = CAST("timeCreated" AS integer);
ALTER TABLE "eeas-rootstock-testnet"."Attestation" DROP COLUMN "timeCreated";
ALTER TABLE "eeas-rootstock-testnet"."Attestation" RENAME COLUMN "timeCreated_new" TO "timeCreated";

ALTER TABLE "eeas-rootstock-testnet"."Attestation" ADD COLUMN "expirationTime_new" INTEGER;
UPDATE "eeas-rootstock-testnet"."Attestation" SET "expirationTime_new" = CAST("expirationTime" AS integer);
ALTER TABLE "eeas-rootstock-testnet"."Attestation" DROP COLUMN "expirationTime";
ALTER TABLE "eeas-rootstock-testnet"."Attestation" RENAME COLUMN "expirationTime_new" TO "expirationTime";

ALTER TABLE "eeas-rootstock-testnet"."Attestation" ADD COLUMN "revocationTime_new" INTEGER;
UPDATE "eeas-rootstock-testnet"."Attestation" SET "revocationTime_new" = CAST("revocationTime" AS integer);
ALTER TABLE "eeas-rootstock-testnet"."Attestation" DROP COLUMN "revocationTime";
ALTER TABLE "eeas-rootstock-testnet"."Attestation" RENAME COLUMN "revocationTime_new" TO "revocationTime";

-- SchemaName
ALTER TABLE "eeas-rootstock-testnet"."SchemaName" ADD COLUMN "time_new" INTEGER;
UPDATE "eeas-rootstock-testnet"."SchemaName" SET "time_new" = CAST("time" AS integer);
ALTER TABLE "eeas-rootstock-testnet"."SchemaName" DROP COLUMN "time";
ALTER TABLE "eeas-rootstock-testnet"."SchemaName" RENAME COLUMN "time_new" TO "time";

COMMIT;

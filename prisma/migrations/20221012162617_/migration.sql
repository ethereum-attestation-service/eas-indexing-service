/*
  Warnings:

  - You are about to alter the column `time` on the `Attestation` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `time` on the `Schema` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Attestation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "attester" TEXT NOT NULL,
    "time" INTEGER NOT NULL,
    "expirationTime" TEXT NOT NULL,
    "revocationTime" TEXT NOT NULL,
    "refUUID" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL,
    "txid" TEXT NOT NULL,
    "schemaId" TEXT NOT NULL,
    CONSTRAINT "Attestation_schemaId_fkey" FOREIGN KEY ("schemaId") REFERENCES "Schema" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Attestation" ("attester", "data", "expirationTime", "id", "recipient", "refUUID", "revocationTime", "revoked", "schemaId", "time", "txid") SELECT "attester", "data", "expirationTime", "id", "recipient", "refUUID", "revocationTime", "revoked", "schemaId", "time", "txid" FROM "Attestation";
DROP TABLE "Attestation";
ALTER TABLE "new_Attestation" RENAME TO "Attestation";
CREATE TABLE "new_Schema" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schemaData" TEXT NOT NULL,
    "schema" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "resolver" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "txid" TEXT NOT NULL,
    "time" INTEGER NOT NULL
);
INSERT INTO "new_Schema" ("creator", "id", "index", "resolver", "schema", "schemaData", "time", "txid") SELECT "creator", "id", "index", "resolver", "schema", "schemaData", "time", "txid" FROM "Schema";
DROP TABLE "Schema";
ALTER TABLE "new_Schema" RENAME TO "Schema";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

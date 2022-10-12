-- CreateTable
CREATE TABLE "Schema" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schemaData" TEXT NOT NULL,
    "schema" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "resolver" TEXT NOT NULL,
    "index" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "time" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Attestation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "attester" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "expirationTime" TEXT NOT NULL,
    "revocationTime" TEXT NOT NULL,
    "refUUID" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL,
    "txid" TEXT NOT NULL,
    "schemaId" TEXT NOT NULL,
    CONSTRAINT "Attestation_schemaId_fkey" FOREIGN KEY ("schemaId") REFERENCES "Schema" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

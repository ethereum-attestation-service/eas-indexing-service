-- CreateTable
CREATE TABLE "Schema" (
    "id" TEXT NOT NULL,
    "schema" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "resolver" TEXT NOT NULL,
    "index" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "time" TEXT NOT NULL,

    CONSTRAINT "Schema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attestation" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "Attestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceStat" (
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ServiceStat_pkey" PRIMARY KEY ("name")
);

-- AddForeignKey
ALTER TABLE "Attestation" ADD CONSTRAINT "Attestation_schemaId_fkey" FOREIGN KEY ("schemaId") REFERENCES "Schema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

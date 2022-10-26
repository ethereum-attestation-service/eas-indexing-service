-- CreateTable
CREATE TABLE "SchemaName" (
    "id" TEXT NOT NULL,
    "schemaId" TEXT NOT NULL,
    "attesterAddress" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "isCreator" BOOLEAN NOT NULL,

    CONSTRAINT "SchemaName_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SchemaName" ADD CONSTRAINT "SchemaName_schemaId_fkey" FOREIGN KEY ("schemaId") REFERENCES "Schema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

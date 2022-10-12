/*
  Warnings:

  - You are about to alter the column `index` on the `Schema` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Schema" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schemaData" TEXT NOT NULL,
    "schema" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "resolver" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "txid" TEXT NOT NULL,
    "time" TEXT NOT NULL
);
INSERT INTO "new_Schema" ("creator", "id", "index", "resolver", "schema", "schemaData", "time", "txid") SELECT "creator", "id", "index", "resolver", "schema", "schemaData", "time", "txid" FROM "Schema";
DROP TABLE "Schema";
ALTER TABLE "new_Schema" RENAME TO "Schema";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

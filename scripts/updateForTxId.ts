import { updateDbFromEthTransaction } from "../utils";

// This is a command line script that accepts a txid as an argument and updates the database with the
// attestations/schemas from the transaction

const txid = process.argv[2];

if (!txid) {
  console.error("Please provide a transaction id");
  process.exit(1);
}

updateDbFromEthTransaction(txid)
  .then(() => {
    console.log("Success");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Error", e);
    process.exit(1);
  });

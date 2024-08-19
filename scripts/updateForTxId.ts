import { updateDbFromEthTransaction } from "../utils";

// This is a command line script that accepts either a single txid or a comma-separated list of txids
// as an argument and updates the database with the attestations/schemas from the transaction(s)

const input = process.argv[2];

if (!input) {
  console.error("Please provide a transaction id or a comma-separated list of transaction ids");
  process.exit(1);
}

const txids = input.split(',').map(txid => txid.trim());

Promise.all(txids.map(updateDbFromEthTransaction))
  .then(() => {
    console.log("Success");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Error", e);
    process.exit(1);
  });
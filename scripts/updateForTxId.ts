import { updateDbFromEthTransaction } from "../utils";

// This is a command line script that accepts either a single txid or a comma-separated list of txids
// as an argument and updates the database with the attestations/schemas from the transaction(s)

const input = process.argv[2];

if (!input) {
  console.error(
    "Please provide a transaction id or a comma-separated list of transaction ids"
  );
  process.exit(1);
}

const txids = input.split(",").map((txid) => txid.trim());

async function processSequentially() {
  for (const txid of txids) {
    try {
      await updateDbFromEthTransaction(txid);
      console.log(`Successfully processed transaction: ${txid}`);
    } catch (error) {
      console.error(`Error processing transaction ${txid}:`, error);

      process.exit(1);
    }
  }
}

processSequentially()
  .then(() => {
    console.log("All transactions processed");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Unexpected error:", e);
    process.exit(1);
  });

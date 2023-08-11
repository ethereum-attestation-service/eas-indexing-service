import {
  getAndUpdateLatestAttestationRevocations,
  getAndUpdateLatestAttestations,
  getAndUpdateLatestOffchainRevocations,
  getAndUpdateLatestSchemas,
  getAndUpdateLatestTimestamps,
  provider,
} from "./utils";
import { startGraph } from "./graph";

require("dotenv").config();

let running = false;

export async function update() {
  if (running) {
    return;
  }

  try {
    running = true;
    await getAndUpdateLatestSchemas();
    await getAndUpdateLatestAttestations();
    await getAndUpdateLatestAttestationRevocations();
    await getAndUpdateLatestTimestamps();
    await getAndUpdateLatestOffchainRevocations();
  } catch (e) {
    console.log("Error!", e);
  }
  running = false;
}

async function go() {
  await update();

  // on every block from ethers provider
  provider.on("block", async () => {
    await update();
  });
}

go();
startGraph();

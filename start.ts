import {
  getAndUpdateLatestAttestationRevocations,
  getAndUpdateLatestAttestations,
  getAndUpdateLatestOffchainRevocations,
  getAndUpdateLatestSchemas,
  getAndUpdateLatestTimestamps,
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

  setTimeout(go, 4000);
}

go();
startGraph();

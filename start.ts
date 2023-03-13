import {
  getAndUpdateLatestAttestationRevocations,
  getAndUpdateLatestAttestations,
  getAndUpdateLatestOffchainRevocations,
  getAndUpdateLatestSchemas,
  getAndUpdateLatestTimestamps,
} from "./utils";

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
}

go();

import {
  attestedEventSignature,
  getAndUpdateLatestAttestationRevocations,
  getAndUpdateLatestAttestations,
  getAndUpdateLatestOffchainRevocations,
  getAndUpdateLatestSchemas,
  getAndUpdateLatestTimestamps,
  provider,
  registeredEventSignature,
  revokedEventSignature,
  revokedOffchainEventSignature,
  timestampEventSignature,
  updateDbFromRelevantLog,
} from "./utils";
import { startGraph } from "./graph";
import { ethers } from "ethers";

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

  const filter = {
    topics: [
      [
        ethers.utils.id(registeredEventSignature),
        ethers.utils.id(attestedEventSignature),
        ethers.utils.id(revokedEventSignature),
        ethers.utils.id(timestampEventSignature),
        ethers.utils.id(revokedOffchainEventSignature),
      ],
    ],
  };

  provider.on(filter, async (log: ethers.providers.Log) => {
    go();
  });

  setTimeout(go, 4000);
}

go();
startGraph();

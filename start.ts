import {ethers} from "ethers";
import {
  attestedEventSignature,
  getAndUpdateLatestAttestationRevocations,
  getAndUpdateLatestAttestations,
  getAndUpdateLatestSchemas, getAndUpdateLatestTimestamps,
  provider,
  registeredEventSignature,
  revokedEventSignature, timestampEventSignature,
  updateDbFromRelevantLog,
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
      ],
    ],
  };

  provider.on(filter, async (log: ethers.providers.Log) => {
    await updateDbFromRelevantLog(log);
  });
}

go();

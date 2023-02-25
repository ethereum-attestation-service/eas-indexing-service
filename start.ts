import { ethers } from "ethers";
import {
  attestedEventSignature,
  EASContractAddress,
  EASSchemaRegistryAddress,
  getAndUpdateLatestAttestationRevocations,
  getAndUpdateLatestAttestations,
  getAndUpdateLatestSchemas,
  getAndUpdateLatestTimestamps,
  provider,
  registeredEventSignature,
  revokedEventSignature,
  timestampEventSignature,
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

  const filterEAS = {
    address: EASContractAddress,
    topics: [
      [
        ethers.utils.id(registeredEventSignature),
        ethers.utils.id(attestedEventSignature),
        ethers.utils.id(revokedEventSignature),
        ethers.utils.id(timestampEventSignature),
      ],
    ],
  };

  const filterSchema = {
    address: EASSchemaRegistryAddress,
    topics: [[ethers.utils.id(registeredEventSignature)]],
  };

  provider.on(filterEAS, async (log: ethers.providers.Log) => {
    await updateDbFromRelevantLog(log);
  });

  provider.on(filterSchema, async (log: ethers.providers.Log) => {
    await updateDbFromRelevantLog(log);
  });
}

go();

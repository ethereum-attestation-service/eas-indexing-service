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
import { Eas__factory, EasSchema__factory } from "./types/ethers-contracts";

require("dotenv").config();
const schemaContract = EasSchema__factory.connect(
  EASSchemaRegistryAddress,
  provider
);

const easContract = Eas__factory.connect(EASContractAddress, provider);
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

  // easContract.filters.Attested.

  // setInterval(async () => {
  //   await go();
  // }, 5000);

  // const filter: ethers.providers.EventType = {
  //   topics: [
  //     [
  //       ethers.utils.id(registeredEventSignature),
  //       ethers.utils.id(attestedEventSignature),
  //       ethers.utils.id(revokedEventSignature),
  //       ethers.utils.id(timestampEventSignature),
  //     ],
  //   ],
  // };
  //
  // provider.on(filter, async (log: ethers.providers.Log) => {
  //   await updateDbFromRelevantLog(log);
  // });

  easContract.on("Timestamped", async (log: ethers.providers.Log) => {
    await updateDbFromRelevantLog(log);
  });
}

go();

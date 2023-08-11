import {
  attestedEventSignature,
  getAndUpdateAllRelevantLogs,
  provider,
  registeredEventSignature,
  revokedEventSignature,
  revokedOffchainEventSignature,
  timestampEventSignature,
} from "./utils";
import { startGraph } from "./graph";
import { ethers } from "ethers";

require("dotenv").config();

let running = false;
let timeout: NodeJS.Timeout | null = null;

export async function update() {
  if (running) {
    return;
  }

  try {
    running = true;
    await getAndUpdateAllRelevantLogs();
  } catch (e) {
    console.log("Error!", e);
  }
  running = false;
}

function setGoTimeout() {
  if (timeout) {
    clearTimeout(timeout);
  }

  timeout = setTimeout(() => {
    console.log("Timeout occurred, calling go function");
    go();
  }, 60000);
}
async function go() {
  await update();
}

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
  setGoTimeout();
  go();
});

go();
setGoTimeout();
startGraph();

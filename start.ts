require("dotenv").config();

import {
  delay,
  getAndUpdateLatestAttestations,
  getAndUpdateLatestSchemas,
  provider,
} from "./utils";

let running = false;

export async function go() {
  if (running) {
    return;
  }

  try {
    running = true;
    await getAndUpdateLatestSchemas();
    await getAndUpdateLatestAttestations();
  } catch (e) {
    console.log("Error!", e);
  }
  running = false;

  setTimeout(go, 2000);
}

go();
//
// provider.on("block", () => {
//
//   go();
// });

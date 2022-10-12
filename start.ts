require("dotenv").config();

import {
  delay,
  getAndUpdateLatestAttestations,
  getAndUpdateLatestSchemas,
  provider,
} from "./utils";

export async function go() {
  try {
    await getAndUpdateLatestSchemas();
    await getAndUpdateLatestAttestations();
  } catch (e) {
    console.log("Error!", e);
  }

  provider.on("block", () => {
    go();
  });
}

go();

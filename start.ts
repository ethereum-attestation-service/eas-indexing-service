require("dotenv").config();

import {
  delay,
  getAndUpdateLatestAttestations,
  getAndUpdateLatestSchemas,
} from "./utils";

export async function go() {
  try {
    await getAndUpdateLatestSchemas();
    await getAndUpdateLatestAttestations();
  } catch (e) {
    console.log("Error!", e);
  }

  await delay(2000);
  go();
}

go();

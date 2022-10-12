import {
  delay,
  getAndUpdateLatestAttestations,
  getAndUpdateLatestSchemas,
} from "./utils";

export async function go() {
  await getAndUpdateLatestSchemas();
  await getAndUpdateLatestAttestations();
  await delay(10000);
  go();
}

go();

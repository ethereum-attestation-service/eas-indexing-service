import { ethers } from "ethers";
import { easSchemaRegistryAbi } from "./abis/easSchemaRegistryAbi";
import { AttestationType, SchemaType } from "./types";
import pLimit from "p-limit";
import { Prisma } from "@prisma/client";
import type { ServiceStat, Attestation } from "@prisma/client";
import { prisma } from "./db.server";
import dayjs from "dayjs";

const limit = pLimit(5);

export const EASContractAddress = "0x4a9Db81755c2F5bC47DdcDC716f0CF5B38252538"; // Goerli
export const EASSchemaRegistryAddress =
  "0x2177e8D1D1ED5e044dEE53C5cEB3bC4a8f4B25A2"; // Goerli
export const EAS712Address = "0x501b2AcD827240f109Bbc630Ab32E6b2702BbdCb"; // Goerli
const CONTRACT_START_BLOCK = 7741696;

const provider = new ethers.providers.InfuraProvider(
  "goerli",
  process.env["INFURA_API_KEY"]
);

const schemaContract = new ethers.Contract(
  EASSchemaRegistryAddress,
  easSchemaRegistryAbi,
  provider
);

export async function getFormattedAttestationFromLog(
  log: ethers.providers.Log
): Promise<Attestation> {
  const [
    UUID,
    schemaUUID,
    refUUID,
    time,
    expirationTime,
    revocationTime,
    recipient,
    attester,
    data,
  ] = await schemaContract.getSchema(log.topics[1]);

  return {
    id: UUID,
    schemaId: schemaUUID,
    data,
    attester,
    recipient,
    refUUID,
    revocationTime,
    expirationTime,
    time: time,
    txid: log.transactionHash,
    revoked: revocationTime < dayjs().unix(),
  };
}

export async function getFormattedSchemaFromLog(
  log: ethers.providers.Log
): Promise<SchemaType> {
  const [UUID, resolver, index, schema] = await schemaContract.getSchema(
    log.topics[1]
  );

  const block = await provider.getBlock(log.blockNumber);
  const tx = await provider.getTransaction(log.transactionHash);

  return {
    id: UUID,
    schema: ethers.utils.toUtf8String(schema),
    schemaData: schema,
    creator: tx.from,
    index: index.toNumber(),
    resolver,
    time: block.timestamp,
    txid: log.transactionHash,
  };
}

export async function getAndUpdateLatestSchemas() {
  const serviceStatPropertyName = "latestSchemaBlockNum";

  const latestSchemaBlockNum = await prisma.serviceStat.findFirst({
    where: { name: serviceStatPropertyName },
  });

  let fromBlock: number = CONTRACT_START_BLOCK;

  if (latestSchemaBlockNum?.value) {
    fromBlock = Number(latestSchemaBlockNum.value);
  }

  const logs = await provider.getLogs({
    address: EASSchemaRegistryAddress,
    fromBlock: fromBlock + 1,
    topics: [
      ethers.utils.id("Registered(bytes32,uint256,bytes,address,address)"),
    ],
  });

  const promises = logs.map((log) =>
    limit(() => getFormattedSchemaFromLog(log))
  );

  const schemas = await Promise.all(promises);

  for (let schema of schemas) {
    await prisma.schema.create({ data: schema });
  }

  const lastBlock = logs.length ? logs[logs.length - 1].blockNumber : 0;

  if (!latestSchemaBlockNum) {
    await prisma.serviceStat.create({
      data: { name: serviceStatPropertyName, value: lastBlock.toString() },
    });
  } else {
    if (lastBlock !== 0) {
      await prisma.serviceStat.create({
        data: { name: serviceStatPropertyName, value: lastBlock.toString() },
      });
    }
  }

  console.log(logs);
}

export async function go() {
  await getAndUpdateLatestSchemas();
  // await getAndUpdateLatestAttestations();
}

go();

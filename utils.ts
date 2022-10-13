import { prisma } from "./db.server";
import { ethers } from "ethers";
import { Attestation, Schema } from "@prisma/client";
import dayjs from "dayjs";
import pLimit from "p-limit";
import { easSchemaRegistryAbi } from "./abis/easSchemaRegistryAbi";
import { easAbi } from "./abis/easAbi";

const limit = pLimit(5);

const EASContractAddress = "0x4a9Db81755c2F5bC47DdcDC716f0CF5B38252538"; // Goerli
const EASSchemaRegistryAddress = "0x2177e8D1D1ED5e044dEE53C5cEB3bC4a8f4B25A2"; // Goerli
const CONTRACT_START_BLOCK = 7741696;

export const provider = new ethers.providers.InfuraProvider(
  "goerli",
  process.env["INFURA_API_KEY"]
);

const schemaContract = new ethers.Contract(
  EASSchemaRegistryAddress,
  easSchemaRegistryAbi,
  provider
);

const eastContract = new ethers.Contract(EASContractAddress, easAbi, provider);

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
  ] = await eastContract.getAttestation(log.data);

  return {
    id: UUID,
    schemaId: schemaUUID,
    data,
    attester,
    recipient,
    refUUID,
    revocationTime: revocationTime.toString(),
    expirationTime: expirationTime.toString(),
    time: time.toString(),
    txid: log.transactionHash,
    revoked: revocationTime < dayjs().unix() && revocationTime !== 0,
  };
}

export async function getFormattedSchemaFromLog(
  log: ethers.providers.Log
): Promise<Schema> {
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
    index: index.toString(),
    resolver,
    time: block.timestamp.toString(),
    txid: log.transactionHash,
  };
}

export async function getAndUpdateLatestAttestationRevocations() {
  const serviceStatPropertyName = "latestAttestationRevocationBlockNum";

  const latestAttestationRevocationBlockNum =
    await prisma.serviceStat.findFirst({
      where: { name: serviceStatPropertyName },
    });

  let fromBlock: number = CONTRACT_START_BLOCK;

  if (latestAttestationRevocationBlockNum?.value) {
    fromBlock = Number(latestAttestationRevocationBlockNum.value);
  }

  console.log(`Attestation revocation update starting from block ${fromBlock}`);

  const logs = await provider.getLogs({
    address: EASContractAddress,
    fromBlock: fromBlock + 1,
    topics: [ethers.utils.id("Revoked(address,address,bytes32,bytes32)")],
  });

  const promises = logs.map((log) =>
    limit(() => getFormattedAttestationFromLog(log))
  );

  const attestations = await Promise.all(promises);

  for (let attestation of attestations) {
    await prisma.attestation.create({ data: attestation });
  }

  const lastBlock = logs.length ? logs[logs.length - 1].blockNumber : 0;

  if (!latestAttestationRevocationBlockNum) {
    await prisma.serviceStat.create({
      data: { name: serviceStatPropertyName, value: lastBlock.toString() },
    });
  } else {
    if (lastBlock !== 0) {
      await prisma.serviceStat.update({
        where: { name: serviceStatPropertyName },
        data: { value: lastBlock.toString() },
      });
    }
  }

  console.log(`New Attestation Revocations: ${logs.length}`);
}

export async function getAndUpdateLatestAttestations() {
  const serviceStatPropertyName = "latestAttestationBlockNum";

  const latestAttestationBlockNum = await prisma.serviceStat.findFirst({
    where: { name: serviceStatPropertyName },
  });

  let fromBlock: number = CONTRACT_START_BLOCK;

  if (latestAttestationBlockNum?.value) {
    fromBlock = Number(latestAttestationBlockNum.value);
  }

  console.log(`Attestation update starting from block ${fromBlock}`);

  const logs = await provider.getLogs({
    address: EASContractAddress,
    fromBlock: fromBlock + 1,
    topics: [ethers.utils.id("Attested(address,address,bytes32,bytes32)")],
  });

  const promises = logs.map((log) =>
    limit(() => getFormattedAttestationFromLog(log))
  );

  const attestations = await Promise.all(promises);

  for (let attestation of attestations) {
    await prisma.attestation.create({ data: attestation });
  }

  const lastBlock = logs.length ? logs[logs.length - 1].blockNumber : 0;

  if (!latestAttestationBlockNum) {
    await prisma.serviceStat.create({
      data: { name: serviceStatPropertyName, value: lastBlock.toString() },
    });
  } else {
    if (lastBlock !== 0) {
      await prisma.serviceStat.update({
        where: { name: serviceStatPropertyName },
        data: { value: lastBlock.toString() },
      });
    }
  }

  console.log(`New Attestations: ${logs.length}`);
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

  console.log(`Schema update starting from block ${fromBlock}`);

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
      await prisma.serviceStat.update({
        where: { name: serviceStatPropertyName },
        data: { value: lastBlock.toString() },
      });
    }
  }

  console.log(`New schemas: ${logs.length}`);
}

export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

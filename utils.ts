import {prisma} from "./db.server";
import {ethers} from "ethers";
import {Attestation, Schema} from "@prisma/client";
import dayjs from "dayjs";
import pLimit from "p-limit";
import {Eas__factory, EasSchema__factory} from "./types/ethers-contracts";

const limit = pLimit(5);

export const EASContractAddress = "0xf0273638b19877fbA1ca9282Adb7ED83ADa819F8"; // Goerli v0.22
export const EASSchemaRegistryAddress =
  "0x40E750bbDCC059cb5F3c24e1B5C84E2D3ea8D2Fc"; // Goerli v0.22
export const CONTRACT_START_BLOCK = 8284412;
export const revokedEventSignature = "Revoked(address,address,bytes32,bytes32)";
export const attestedEventSignature =
  "Attested(address,address,bytes32,bytes32)";
export const registeredEventSignature = "Registered(bytes32,address)";
export const schemaNameUUID =
  "0x44d562ac1d7cd77e232978687fea027ace48f719cf1d58c7888e509663bb87fc"; // Goerli v0.22

export const provider = new ethers.providers.InfuraProvider(
  "goerli",
  process.env["INFURA_API_KEY"]
);

const schemaContract = EasSchema__factory.connect(
  EASSchemaRegistryAddress,
  provider
);

const easContract = Eas__factory.connect(EASContractAddress, provider);

// Timeout Promise
function timeout(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


export async function getFormattedAttestationFromLog(
  log: ethers.providers.Log
): Promise<Attestation> {
  let UUID = ethers.constants.HashZero;
  let schemaUUID = ethers.constants.HashZero;
  let refUUID = ethers.constants.HashZero;
  let time = 0;
  let expirationTime = 0;
  let revocationTime = 0;
  let recipient = ethers.constants.AddressZero;
  let attester = ethers.constants.AddressZero;
  let revocable = false;
  let data = "";

  let tries = 1;

  do {
    [
      UUID,
      schemaUUID,
      refUUID,
      time,
      expirationTime,
      revocationTime,
      recipient,
      attester,
      revocable,
      data,
    ] = await easContract.getAttestation(log.data);

    if (UUID === ethers.constants.HashZero) {
      console.log(`Delaying attestation poll after try #${tries}...`);
      await timeout(500);
    }

    tries++;
  } while (UUID === ethers.constants.HashZero);

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
    isOffchain: false,
    ipfsHash: "",
    timeCreated: dayjs().unix().toString(),
    revocable
  };
}

export async function getFormattedSchemaFromLog(
  log: ethers.providers.Log
): Promise<Omit<Schema, "index">> {

  let UUID = ethers.constants.HashZero;
  let resolver = ethers.constants.AddressZero;
  let revocable = false;
  let schema = "";

  let tries = 1;


  do {
    [UUID, resolver, revocable, schema] = await schemaContract.getSchema(
      log.topics[1]
    );

    if (UUID === ethers.constants.HashZero) {
      console.log(`Delaying schema poll after try #${tries}...`);
      await timeout(500);
    }

    tries++;
  } while (UUID === ethers.constants.HashZero);


  const block = await provider.getBlock(log.blockNumber);
  const tx = await provider.getTransaction(log.transactionHash);

  return {
    id: UUID,
    schema: schema,
    creator: tx.from,
    resolver,
    time: block.timestamp.toString(),
    txid: log.transactionHash,
    revocable
  };
}

export async function revokeAttestationsFromLogs(logs: ethers.providers.Log[]) {
  for (let log of logs) {

    const attestation = await easContract.getAttestation(log.data);
    await prisma.attestation.update({
      where: {id: attestation[0]},
      data: {revoked: true, revocationTime: attestation.revocationTime.toString()}
    })
  }
}

export async function createSchemasFromLogs(logs: ethers.providers.Log[]) {
  const promises = logs.map((log) =>
    limit(() => getFormattedSchemaFromLog(log))
  );

  const schemas = await Promise.all(promises);

  for (let schema of schemas) {
    const schemaCount = await prisma.schema.count();

    console.log("Creating new schema", schema);
    await prisma.schema.create({
      data: {...schema, index: (schemaCount + 1).toString()},
    });
  }
}

export async function createAttestationsForLogs(logs: ethers.providers.Log[]) {
  const promises = logs.map((log) =>
    limit(() => getFormattedAttestationFromLog(log))
  );

  const attestations = await Promise.all(promises);

  for (let attestation of attestations) {
    console.log("Creating new attestation", attestation);

    await prisma.attestation.create({data: attestation});
    await processCreatedAttestation(attestation);
  }
}

export async function processCreatedAttestation(
  attestation: Attestation
): Promise<void> {
  if (attestation.schemaId === schemaNameUUID) {
    try {
      const decodedNameAttestationData = ethers.utils.defaultAbiCoder.decode(
        ["bytes32", "string"],
        attestation.data
      );

      const schema = await prisma.schema.findUnique({
        where: {id: decodedNameAttestationData[0]},
      });

      if (!schema) {
        console.log("Error: Schema doesnt exist!");
        return;
      }

      console.log("Adding new schema name: ", decodedNameAttestationData[1]);

      await prisma.schemaName.create({
        data: {
          name: decodedNameAttestationData[1],
          schemaId: schema.id,
          time: dayjs().unix().toString(),
          attesterAddress: attestation.attester,
          isCreator:
            attestation.attester.toLowerCase() === schema.creator.toLowerCase(),
        },
      });
    } catch (e) {
      console.log("Error: Unable to decode schema name", e);
      return;
    }
  }
}

export async function getAndUpdateLatestAttestationRevocations() {
  const serviceStatPropertyName = "latestAttestationRevocationBlockNum";

  const {latestBlockNumServiceStat, fromBlock} = await getStartData(
    serviceStatPropertyName
  );

  console.log(`Attestation revocation update starting from block ${fromBlock}`);

  const logs = await provider.getLogs({
    address: EASContractAddress,
    fromBlock: fromBlock + 1,
    topics: [ethers.utils.id(revokedEventSignature)],
  });

  await revokeAttestationsFromLogs(logs);

  const lastBlock = getLastBlockNumberFromLog(logs);

  await updateServiceStatToLastBlock(
    !latestBlockNumServiceStat,
    serviceStatPropertyName,
    lastBlock
  );

  console.log(`New Attestation Revocations: ${logs.length}`);
}

export async function updateServiceStatToLastBlock(
  shouldCreate: boolean,
  serviceStatPropertyName: string,
  lastBlock: number
) {
  if (shouldCreate) {
    await prisma.serviceStat.create({
      data: {name: serviceStatPropertyName, value: lastBlock.toString()},
    });
  } else {
    if (lastBlock !== 0) {
      await prisma.serviceStat.update({
        where: {name: serviceStatPropertyName},
        data: {value: lastBlock.toString()},
      });
    }
  }
}

export async function getAndUpdateLatestAttestations() {
  const serviceStatPropertyName = "latestAttestationBlockNum";

  const {latestBlockNumServiceStat, fromBlock} = await getStartData(
    serviceStatPropertyName
  );

  console.log(`Attestation update starting from block ${fromBlock}`);

  const logs = await provider.getLogs({
    address: EASContractAddress,
    fromBlock: fromBlock + 1,
    topics: [ethers.utils.id(attestedEventSignature)],
  });

  await createAttestationsForLogs(logs);

  const lastBlock = getLastBlockNumberFromLog(logs);

  await updateServiceStatToLastBlock(
    !latestBlockNumServiceStat,
    serviceStatPropertyName,
    lastBlock
  );

  console.log(`New Attestations: ${logs.length}`);
}

async function getStartData(serviceStatPropertyName: string) {
  const latestBlockNumServiceStat = await prisma.serviceStat.findFirst({
    where: {name: serviceStatPropertyName},
  });

  let fromBlock: number = CONTRACT_START_BLOCK;

  if (latestBlockNumServiceStat?.value) {
    fromBlock = Number(latestBlockNumServiceStat.value);
  }
  return {latestBlockNumServiceStat, fromBlock};
}

export function getLastBlockNumberFromLog(logs: ethers.providers.Log[]) {
  return logs.length ? logs[logs.length - 1].blockNumber : 0;
}

export async function getAndUpdateLatestSchemas() {
  const serviceStatPropertyName = "latestSchemaBlockNum";

  const {latestBlockNumServiceStat, fromBlock} = await getStartData(
    serviceStatPropertyName
  );

  console.log(`Schema update starting from block ${fromBlock}`);

  const logs = await provider.getLogs({
    address: EASSchemaRegistryAddress,
    fromBlock: fromBlock + 1,
    topics: [ethers.utils.id(registeredEventSignature)],
  });

  await createSchemasFromLogs(logs);

  const lastBlock = getLastBlockNumberFromLog(logs);

  await updateServiceStatToLastBlock(
    !latestBlockNumServiceStat,
    serviceStatPropertyName,
    lastBlock
  );

  console.log(`New schemas: ${logs.length}`);
}

export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function updateDbFromRelevantLog(log: ethers.providers.Log) {
  if (log.address === EASSchemaRegistryAddress) {
    if (log.topics[0] === ethers.utils.id(registeredEventSignature)) {
      await createSchemasFromLogs([log]);
      await updateServiceStatToLastBlock(
        false,
        "latestSchemaBlockNum",
        log.blockNumber
      );
    }
  } else if (log.address === EASContractAddress) {
    if (log.topics[0] === ethers.utils.id(attestedEventSignature)) {
      await createAttestationsForLogs([log]);
      await updateServiceStatToLastBlock(
        false,
        "latestAttestationBlockNum",
        log.blockNumber
      );
    } else if (log.topics[0] === ethers.utils.id(revokedEventSignature)) {
      await revokeAttestationsFromLogs([log]);
      await updateServiceStatToLastBlock(
        false,
        "latestAttestationRevocationBlockNum",
        log.blockNumber
      );
    }
  }
}

import { prisma } from "./db.server";
import { ethers } from "ethers";
import { Attestation, Schema } from "@prisma/client";
import dayjs from "dayjs";
import pLimit from "p-limit";
import { Eas__factory, EasSchema__factory } from "./types/ethers-contracts";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";

const limit = pLimit(5);

export type EASChainConfig = {
  chainId: number;
  chainName: string;
  version: string;
  contractAddress: string;
  schemaRegistryAddress: string;
  etherscanURL: string;
  /** Must contain a trailing dot (unless mainnet). */
  subdomain: string;
  contractStartBlock: number;
  rpcProvider: string;
};

export const CHAIN_ID = Number(process.env.CHAIN_ID);

if (!CHAIN_ID) {
  throw new Error("No chain ID specified");
}

export const EAS_CHAIN_CONFIGS: EASChainConfig[] = [
  // {
  //   chainId: 11155111,
  //   chainName: "Sepolia",
  //   subdomain: "",
  //   version: "0.25",
  //   contractAddress: "0x25E36ebB051ae76c0D59E6c1dD0b29A5fc520061",
  //   schemaRegistryAddress: "0x4dd8b988B64A4052B5f142Af845AA49D2B2cD10D",
  //   etherscanURL: "https://sepolia.etherscan.io",
  //   contractStartBlock: 2825261,
  //   rpcProvider: "https://rpc.sepolia.ethpandaops.io/",
  // },
  {
    chainId: 11155111,
    chainName: "sepolia",
    subdomain: "",
    version: "0.26",
    contractAddress: "0xC2679fBD37d54388Ce493F1DB75320D236e1815e",
    schemaRegistryAddress: "0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0",
    etherscanURL: "https://sepolia.etherscan.io",
    contractStartBlock: 2958570,
    rpcProvider: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
  },
  {
    chainId: 42161,
    chainName: "arbitrum",
    subdomain: "arbitrum.",
    version: "0.26",
    contractAddress: "0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458",
    schemaRegistryAddress: "0xA310da9c5B885E7fb3fbA9D66E9Ba6Df512b78eB",
    contractStartBlock: 64528380,
    etherscanURL: "https://arbiscan.io",
    rpcProvider: `https://arbitrum-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
  },
  {
    chainId: 1,
    chainName: "mainnet",
    subdomain: "",
    version: "0.26",
    contractAddress: "0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587",
    schemaRegistryAddress: "0xA7b39296258348C78294F95B872b282326A97BDF",
    contractStartBlock: 16756720,
    etherscanURL: "https://etherscan.io",
    rpcProvider: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
  },
  {
    chainId: 420,
    chainName: "optimism-goerli",
    subdomain: "optimism-goerli.",
    version: "0.27",
    contractAddress: "0x1a5650D0EcbCa349DD84bAFa85790E3e6955eb84",
    schemaRegistryAddress: "0x7b24C7f8AF365B4E308b6acb0A7dfc85d034Cb3f",
    contractStartBlock: 8513369,
    etherscanURL: "https://goerli-optimism.etherscan.io/",
    rpcProvider: `https://opt-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_OPTIMISM_GOERLI_API_KEY}`,
  },
  {
    chainId: 84531,
    chainName: "base-goerli",
    subdomain: "base-goerli.",
    version: "0.27",
    contractAddress: "0xAcfE09Fd03f7812F022FBf636700AdEA18Fd2A7A",
    schemaRegistryAddress: "0x720c2bA66D19A725143FBf5fDC5b4ADA2742682E",
    contractStartBlock: 4843430,
    etherscanURL: "https://goerli.basescan.org/",
    rpcProvider: `https://goerli.base.org`,
  },
];

const activeChainConfig = EAS_CHAIN_CONFIGS.find(
  (config) => config.chainId === CHAIN_ID
);

if (!activeChainConfig) {
  throw new Error("No chain config found for chain ID");
}

export const EASContractAddress = activeChainConfig.contractAddress;
export const EASSchemaRegistryAddress = activeChainConfig.schemaRegistryAddress;
export const CONTRACT_START_BLOCK = activeChainConfig.contractStartBlock;
export const revokedEventSignature = "Revoked(address,address,bytes32,bytes32)";
export const revokedOffchainEventSignature =
  "RevokedOffchain(address,bytes32,uint64)";
export const attestedEventSignature =
  "Attested(address,address,bytes32,bytes32)";
export const registeredEventSignature = "Registered(bytes32,address)";
export const timestampEventSignature = "Timestamped(bytes32,uint64)";
export const schemaNameUID =
  "0x44d562ac1d7cd77e232978687fea027ace48f719cf1d58c7888e509663bb87fc"; // Sepolia v0.25

export const provider = new ethers.providers.StaticJsonRpcProvider(
  activeChainConfig.rpcProvider,
  activeChainConfig.chainName
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
  let UID = ethers.constants.HashZero;
  let schemaUID = ethers.constants.HashZero;
  let refUID = ethers.constants.HashZero;
  let time = ethers.BigNumber.from(0);
  let expirationTime = ethers.BigNumber.from(0);
  let revocationTime = ethers.BigNumber.from(0);
  let recipient = ethers.constants.AddressZero;
  let attester = ethers.constants.AddressZero;
  let revocable = false;
  let data = "";

  let tries = 1;

  do {
    [
      UID,
      schemaUID,
      time,
      expirationTime,
      revocationTime,
      refUID,
      recipient,
      attester,
      revocable,
      data,
    ] = await easContract.getAttestation(log.data);

    if (UID === ethers.constants.HashZero) {
      console.log(`Delaying attestation poll after try #${tries}...`);
      await timeout(500);
    }

    tries++;
  } while (UID === ethers.constants.HashZero);

  let decodedDataJson = "";

  try {
    const schema = await prisma.schema.findUnique({
      where: { id: schemaUID },
    });

    const schemaEncoder = new SchemaEncoder(schema!.schema);
    decodedDataJson = JSON.stringify(schemaEncoder.decodeData(data));
  } catch (error) {
    console.log("Error decoding data 53432", error);
  }

  return {
    id: UID,
    schemaId: schemaUID,
    data,
    attester,
    recipient,
    refUID: refUID,
    revocationTime: revocationTime.toNumber(),
    expirationTime: expirationTime.toNumber(),
    time: time.toNumber(),
    txid: log.transactionHash,
    revoked: revocationTime.lt(dayjs().unix()) && !revocationTime.isZero(),
    isOffchain: false,
    ipfsHash: "",
    timeCreated: dayjs().unix(),
    revocable,
    decodedDataJson,
  };
}

export async function getFormattedSchemaFromLog(
  log: ethers.providers.Log
): Promise<Omit<Schema, "index">> {
  let UID = ethers.constants.HashZero;
  let resolver = ethers.constants.AddressZero;
  let revocable = false;
  let schema = "";

  let tries = 1;

  do {
    [UID, resolver, revocable, schema] = await schemaContract.getSchema(
      log.topics[1]
    );

    if (UID === ethers.constants.HashZero) {
      console.log(`Delaying schema poll after try #${tries}...`);
      await timeout(500);
    }

    tries++;
  } while (UID === ethers.constants.HashZero);

  const block = await provider.getBlock(log.blockNumber);
  const tx = await provider.getTransaction(log.transactionHash);

  return {
    id: UID,
    schema: schema,
    creator: tx.from,
    resolver,
    time: block.timestamp,
    txid: log.transactionHash,
    revocable,
  };
}

export async function revokeAttestationsFromLogs(logs: ethers.providers.Log[]) {
  for (let log of logs) {
    const attestation = await easContract.getAttestation(log.data);
    await prisma.attestation.update({
      where: { id: attestation[0] },
      data: {
        revoked: true,
        revocationTime: attestation.revocationTime.toNumber(),
      },
    });
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
      data: { ...schema, index: (schemaCount + 1).toString() },
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

    await prisma.attestation.create({ data: attestation });
    await processCreatedAttestation(attestation);
  }
}

export async function createOffchainRevocationsForLogs(
  logs: ethers.providers.Log[]
) {
  for (let log of logs) {
    const uid = log.topics[2];
    const timestamp = ethers.BigNumber.from(log.topics[3]).toNumber();
    console.log("Creating new offchainrevoke Log for", uid, timestamp);

    const tx = await provider.getTransaction(log.transactionHash);

    const newRevocation = await prisma.offchainRevocation.create({
      data: {
        timestamp,
        uid,
        from: tx.from,
        txid: log.transactionHash,
      },
    });

    await prisma.attestation.updateMany({
      where: { id: uid, isOffchain: true, attester: tx.from },
      data: {
        revoked: true,
        revocationTime: newRevocation.timestamp,
      },
    });
  }
}

export async function createTimestampForLogs(logs: ethers.providers.Log[]) {
  for (let log of logs) {
    const uid = log.topics[1];
    const timestamp = ethers.BigNumber.from(log.topics[2]).toNumber();
    console.log("Creating new Log for", uid, timestamp);

    const tx = await provider.getTransaction(log.transactionHash);

    await prisma.timestamp.create({
      data: {
        id: uid,
        timestamp,
        from: tx.from,
        txid: log.transactionHash,
      },
    });
  }
}

export async function processCreatedAttestation(
  attestation: Attestation
): Promise<void> {
  if (attestation.schemaId === schemaNameUID) {
    try {
      const decodedNameAttestationData = ethers.utils.defaultAbiCoder.decode(
        ["bytes32", "string"],
        attestation.data
      );

      const schema = await prisma.schema.findUnique({
        where: { id: decodedNameAttestationData[0] },
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
          time: dayjs().unix(),
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

  const { latestBlockNumServiceStat, fromBlock } = await getStartData(
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
}

export async function getAndUpdateLatestTimestamps() {
  const serviceStatPropertyName = "latestTimestampBlockNum";

  const { latestBlockNumServiceStat, fromBlock } = await getStartData(
    serviceStatPropertyName
  );

  console.log(`Timestamp update starting from block ${fromBlock}`);

  const logs = await provider.getLogs({
    address: EASContractAddress,
    fromBlock: fromBlock + 1,
    topics: [ethers.utils.id(timestampEventSignature)],
  });

  await createTimestampForLogs(logs);

  const lastBlock = getLastBlockNumberFromLog(logs);

  await updateServiceStatToLastBlock(
    !latestBlockNumServiceStat,
    serviceStatPropertyName,
    lastBlock
  );

  console.log(`New Timestamps: ${logs.length}`);
}

export async function getAndUpdateLatestOffchainRevocations() {
  const serviceStatPropertyName = "latestOffchainRevocationBlockNum";

  const { latestBlockNumServiceStat, fromBlock } = await getStartData(
    serviceStatPropertyName
  );

  console.log(`Offchain revocation update starting from block ${fromBlock}`);

  const logs = await provider.getLogs({
    address: EASContractAddress,
    fromBlock: fromBlock + 1,
    topics: [ethers.utils.id(revokedOffchainEventSignature)],
  });

  await createOffchainRevocationsForLogs(logs);

  const lastBlock = getLastBlockNumberFromLog(logs);

  await updateServiceStatToLastBlock(
    !latestBlockNumServiceStat,
    serviceStatPropertyName,
    lastBlock
  );

  console.log(`New Revocations Offchain: ${logs.length}`);
}

export async function getAndUpdateLatestAttestations() {
  const serviceStatPropertyName = "latestAttestationBlockNum";

  const { latestBlockNumServiceStat, fromBlock } = await getStartData(
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
    where: { name: serviceStatPropertyName },
  });

  let fromBlock: number = CONTRACT_START_BLOCK;

  if (latestBlockNumServiceStat?.value) {
    fromBlock = Number(latestBlockNumServiceStat.value);
  }

  if (fromBlock === 0) {
    fromBlock = CONTRACT_START_BLOCK;
  }

  return { latestBlockNumServiceStat, fromBlock };
}

export function getLastBlockNumberFromLog(logs: ethers.providers.Log[]) {
  return logs.length ? logs[logs.length - 1].blockNumber : 0;
}

export async function getAndUpdateLatestSchemas() {
  const serviceStatPropertyName = "latestSchemaBlockNum";

  const { latestBlockNumServiceStat, fromBlock } = await getStartData(
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
    } else if (log.topics[0] === ethers.utils.id(timestampEventSignature)) {
      await createTimestampForLogs([log]);
      await updateServiceStatToLastBlock(
        false,
        "latestTimestampBlockNum",
        log.blockNumber
      );
    } else if (
      log.topics[0] === ethers.utils.id(revokedOffchainEventSignature)
    ) {
      await createOffchainRevocationsForLogs([log]);
      await updateServiceStatToLastBlock(
        false,
        "latestOffchainRevocationBlockNum",
        log.blockNumber
      );
    }
  }
}

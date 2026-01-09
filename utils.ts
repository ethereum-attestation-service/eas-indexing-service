import { prisma } from "./db.server";
import { ethers } from "ethers";
import { Attestation, Schema } from "@prisma/client";
import dayjs from "dayjs";
import pLimit from "p-limit";
import { Eas__factory, EasSchema__factory } from "./types/ethers-contracts";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { EAS_CHAIN_CONFIGS } from "./chainConfigs";
export { EAS_CHAIN_CONFIGS, EASChainConfig } from "./chainConfigs";

const batchSize = process.env.BATCH_SIZE
  ? Number(process.env.BATCH_SIZE)
  : 9500;

const requestDelay = process.env.REQUEST_DELAY
  ? Number(process.env.REQUEST_DELAY)
  : 0;

const concurrencyLimit = process.env.CONCURRENCY_LIMIT
  ? Number(process.env.CONCURRENCY_LIMIT)
  : 20;
const limit = pLimit(concurrencyLimit);

// Add a constant for maximum retries
const MAX_RETRIES = 5;

// Reorg handling constants
const REORG_DEPTH = Number(process.env.REORG_DEPTH) || 64;
const RECENT_BLOCKS_KEY = "recentBlocks";

interface BlockRecord {
  number: number;
  hash: string;
  txids: string[];
}

interface RecentBlockHistory {
  blocks: BlockRecord[];
}

export const CHAIN_ID = Number(process.env.CHAIN_ID);

if (!CHAIN_ID) {
  throw new Error("No chain ID specified");
}

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
export const registeredEventSignatureV1 = "Registered(bytes32,address)";
export const registeredEventSignatureV2 =
  "Registered(bytes32,address,(bytes32,address,bool,string))";

export const timestampEventSignature = "Timestamped(bytes32,uint64)";
export const schemaNameUID =
  "0x44d562ac1d7cd77e232978687fea027ace48f719cf1d58c7888e509663bb87fc"; // Sepolia v0.25

export const provider = new ethers.providers.StaticJsonRpcProvider(
  activeChainConfig.rpcProvider,
  activeChainConfig.chainId
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

// Helper to create attestation from chain data (for backfilling missing attestations)
async function createAttestationFromChainData(
  chainAttestation: Awaited<ReturnType<typeof easContract.getAttestation>>,
  txid: string
): Promise<Attestation> {
  const [
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
  ] = chainAttestation;

  let decodedDataJson = "";
  try {
    const schema = await prisma.schema.findUnique({
      where: { id: schemaUID },
    });
    if (schema) {
      const schemaEncoder = new SchemaEncoder(schema.schema);
      decodedDataJson = JSON.stringify(schemaEncoder.decodeData(data));
    }
  } catch (error) {
    console.log("Error decoding data during backfill", error);
  }

  return {
    id: UID,
    schemaId: schemaUID,
    data,
    attester,
    recipient,
    refUID,
    revocationTime: safeToNumber(revocationTime),
    expirationTime: safeToNumber(expirationTime),
    time: time.toNumber(),
    txid,
    revoked: !revocationTime.isZero(),
    isOffchain: false,
    ipfsHash: "",
    timeCreated: dayjs().unix(),
    revocable,
    decodedDataJson,
  };
}

const safeToNumber = (num: ethers.BigNumber) => {
  try {
    const tmpNum = num.toNumber();
    if (tmpNum > 2147483647) {
      return 2147483647;
    } else {
      return tmpNum;
    }
  } catch (error) {
    console.log("Error converting to number", error);

    // return max number
    return 2147483647;
  }
};

export async function getFormattedAttestationFromLog(
  log: ethers.providers.Log
): Promise<Attestation | null> {
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
    if (tries > MAX_RETRIES) {
      throw new Error(
        `Max retries reached for attestation in tx ${log.transactionHash}. Failing batch to retry later.`
      );
    }

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

    if (!schema) {
      throw new Error(
        `Schema ${schemaUID} not found in DB for attestation in tx ${log.transactionHash}. Failing batch to retry.`
      );
    }

    const schemaEncoder = new SchemaEncoder(schema.schema);
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
    revocationTime: safeToNumber(revocationTime),
    expirationTime: safeToNumber(expirationTime),
    time: time.toNumber(),
    txid: log.transactionHash,
    revoked: !revocationTime.isZero(),
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
    if (tries > MAX_RETRIES) {
      console.log(
        `Max retries reached for schema log ${log.transactionHash}. Skipping...`
      );
      throw new Error("Max retries reached while fetching schema.");
    }

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
  if (logs.length === 0) {
    return { processed: 0, backfilled: 0 };
  }

  // 1. Extract attestation IDs directly from logs (no RPC needed)
  const attestationIds = logs.map((log) => log.data);

  // 2. Check which exist in DB
  const existingAttestations = await prisma.attestation.findMany({
    where: { id: { in: attestationIds } },
    select: { id: true },
  });
  const existingIdSet = new Set(existingAttestations.map((a) => a.id));

  // 3. Find missing attestations and backfill them (only these need RPC calls)
  const missingLogs = logs.filter((log) => !existingIdSet.has(log.data));
  let backfilledCount = 0;

  if (missingLogs.length > 0) {
    console.log(
      `Backfilling ${missingLogs.length} missing attestations before revocation`
    );
    const chainAttestations = await Promise.all(
      missingLogs.map((log) => limit(() => easContract.getAttestation(log.data)))
    );
    const backfillAttestations = await Promise.all(
      chainAttestations.map((a, i) =>
        createAttestationFromChainData(a, missingLogs[i].transactionHash)
      )
    );
    await prisma.attestation.createMany({
      data: backfillAttestations,
      skipDuplicates: true,
    });
    backfilledCount = backfillAttestations.length;
  }

  // 4. Get block timestamps for revocation times (batch by unique blocks)
  const uniqueBlocks = [...new Set(logs.map((l) => l.blockNumber))];
  const blockTimestamps = new Map<number, number>();
  await Promise.all(
    uniqueBlocks.map(async (blockNum) => {
      const block = await provider.getBlock(blockNum);
      blockTimestamps.set(blockNum, block.timestamp);
    })
  );

  // 5. Update all attestations with revocation
  console.log(`Processing ${logs.length} revocations`);
  const updatedAttestations = await prisma.$transaction(
    logs.map((log) =>
      prisma.attestation.update({
        where: { id: log.data },
        data: {
          revoked: true,
          revocationTime: blockTimestamps.get(log.blockNumber)!,
        },
      })
    )
  );

  // Process schema names for revoked attestations
  for (const attestation of updatedAttestations) {
    await processRevokedAttestation(attestation);
  }

  return { processed: logs.length, backfilled: backfilledCount };
}

export async function createSchemasFromLogs(logs: ethers.providers.Log[]) {
  if (logs.length === 0) {
    return { created: 0, existed: 0 };
  }

  // 1. Extract schema IDs from logs (no RPC needed)
  const schemaIds = logs.map((log) => log.topics[1]);

  // 2. Check which exist in DB
  const existingIds = await prisma.schema.findMany({
    where: { id: { in: schemaIds } },
    select: { id: true },
  });
  const existingIdSet = new Set(existingIds.map((s) => s.id));

  // 3. Filter to only logs for new schemas
  const missingLogs = logs.filter((log) => !existingIdSet.has(log.topics[1]));

  if (missingLogs.length === 0) {
    console.log(`All ${logs.length} schemas already exist, skipping`);
    return { created: 0, existed: existingIdSet.size };
  }

  // 4. Only fetch chain data for missing schemas
  const schemas = await Promise.all(
    missingLogs.map((log) => limit(() => getFormattedSchemaFromLog(log)))
  );

  // Get current count once for indexing
  const schemaCount = await prisma.schema.count();

  // Add index to each new schema
  const schemasWithIndex = schemas.map((schema, i) => ({
    ...schema,
    index: (schemaCount + i + 1).toString(),
  }));

  console.log(
    `Creating ${schemas.length} new schemas (${existingIdSet.size} already existed)`
  );

  // Batch insert all new schemas
  await prisma.schema.createMany({
    data: schemasWithIndex,
    skipDuplicates: true,
  });

  return { created: schemas.length, existed: existingIdSet.size };
}

export async function createAttestationsForLogs(logs: ethers.providers.Log[]) {
  if (logs.length === 0) {
    return { created: 0, existed: 0 };
  }

  // 1. Extract attestation IDs from logs (no RPC needed)
  const attestationIds = logs.map((log) => log.data);

  // 2. Check which exist in DB
  const existingIds = await prisma.attestation.findMany({
    where: { id: { in: attestationIds } },
    select: { id: true },
  });
  const existingIdSet = new Set(existingIds.map((a) => a.id));

  // 3. Filter to only logs for new attestations
  const missingLogs = logs.filter((log) => !existingIdSet.has(log.data));

  if (missingLogs.length === 0) {
    console.log(
      `All ${logs.length} attestations already exist, skipping`
    );
    return { created: 0, existed: existingIdSet.size };
  }

  // 4. Only fetch chain data for missing attestations
  const attestations = await Promise.all(
    missingLogs.map((log) => limit(() => getFormattedAttestationFromLog(log)))
  );
  const validAttestations = attestations.filter(
    (a): a is Attestation => a !== null
  );

  if (validAttestations.length === 0) {
    return { created: 0, existed: existingIdSet.size };
  }

  console.log(
    `Creating ${validAttestations.length} new attestations (${existingIdSet.size} already existed)`
  );

  // Batch insert all new attestations
  await prisma.attestation.createMany({
    data: validAttestations,
    skipDuplicates: true,
  });

  // Process schema names for newly created attestations
  for (const attestation of validAttestations) {
    await processCreatedAttestation(attestation);
  }

  return { created: validAttestations.length, existed: existingIdSet.size };
}

export async function createOffchainRevocationsForLogs(
  logs: ethers.providers.Log[]
) {
  if (logs.length === 0) {
    return { created: 0, existed: 0 };
  }

  // 1. Extract UIDs from logs (no RPC needed)
  const uids = logs.map((log) => log.topics[2]);

  // 2. Check which offchain revocations already exist
  const existingRevocations = await prisma.offchainRevocation.findMany({
    where: { uid: { in: uids } },
    select: { uid: true },
  });
  const existingUidSet = new Set(existingRevocations.map((r) => r.uid));

  // 3. Filter to only logs for new revocations
  const missingLogs = logs.filter((log) => !existingUidSet.has(log.topics[2]));

  if (missingLogs.length === 0) {
    console.log(
      `All ${logs.length} offchain revocations already exist, skipping`
    );
    return { created: 0, existed: existingUidSet.size };
  }

  // 4. Only fetch transactions for new revocations
  const transactions = await Promise.all(
    missingLogs.map((log) =>
      limit(() => provider.getTransaction(log.transactionHash))
    )
  );

  // Prepare revocation data
  const revocationData = missingLogs.map((log, i) => {
    const uid = log.topics[2];
    const timestamp = ethers.BigNumber.from(log.topics[3]).toNumber();
    const tx = transactions[i];
    return {
      uid,
      timestamp,
      from: tx.from,
      txid: log.transactionHash,
    };
  });

  console.log(
    `Creating ${revocationData.length} offchain revocations (${existingUidSet.size} already existed)`
  );

  // Batch create revocations
  await prisma.offchainRevocation.createMany({
    data: revocationData,
    skipDuplicates: true,
  });

  // Batch update attestations using transaction for consistency
  await prisma.$transaction(
    revocationData.map((rev) =>
      prisma.attestation.updateMany({
        where: { id: rev.uid, isOffchain: true, attester: rev.from },
        data: {
          revoked: true,
          revocationTime: rev.timestamp,
        },
      })
    )
  );

  return { created: revocationData.length, existed: existingUidSet.size };
}

export async function createTimestampForLogs(logs: ethers.providers.Log[]) {
  if (logs.length === 0) {
    return { created: 0, existed: 0 };
  }

  // 1. Extract IDs from logs (no RPC needed)
  const timestampIds = logs.map((log) => log.topics[1]);

  // 2. Check which timestamps already exist
  const existingTimestamps = await prisma.timestamp.findMany({
    where: { id: { in: timestampIds } },
    select: { id: true },
  });
  const existingIdSet = new Set(existingTimestamps.map((t) => t.id));

  // 3. Filter to only logs for new timestamps
  const missingLogs = logs.filter((log) => !existingIdSet.has(log.topics[1]));

  if (missingLogs.length === 0) {
    console.log(`All ${logs.length} timestamps already exist, skipping`);
    return { created: 0, existed: existingIdSet.size };
  }

  // 4. Only fetch transactions for new timestamps
  const transactions = await Promise.all(
    missingLogs.map((log) =>
      limit(() => provider.getTransaction(log.transactionHash))
    )
  );

  // Prepare timestamp data
  const timestampData = missingLogs.map((log, i) => {
    const uid = log.topics[1];
    const timestamp = ethers.BigNumber.from(log.topics[2]).toNumber();
    const tx = transactions[i];
    return {
      id: uid,
      timestamp,
      from: tx.from,
      txid: log.transactionHash,
    };
  });

  console.log(
    `Creating ${timestampData.length} timestamps (${existingIdSet.size} already existed)`
  );

  // Batch create timestamps
  await prisma.timestamp.createMany({
    data: timestampData,
    skipDuplicates: true,
  });

  return { created: timestampData.length, existed: existingIdSet.size };
}

export async function processRevokedAttestation(
  attestation: Attestation
): Promise<void> {
  if (attestation.schemaId === schemaNameUID) {
    try {
      const decodedNameAttestationData = ethers.utils.defaultAbiCoder.decode(
        ["bytes32", "string"],
        attestation.data
      );

      console.log("Removing schema name: ", decodedNameAttestationData[1]);

      console.log({
        name: decodedNameAttestationData[1],
        schemaId: decodedNameAttestationData[0],
        attesterAddress: attestation.attester,
      });

      await prisma.schemaName.deleteMany({
        where: {
          name: decodedNameAttestationData[1],
          schemaId: decodedNameAttestationData[0],
          attesterAddress: attestation.attester,
        },
      });
    } catch (e) {
      console.log("Error: Unable to decode schema name", e);
      return;
    }
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

export async function updateServiceStatToLastBlock(
  serviceStatPropertyName: string,
  lastBlock: number
) {
  if (lastBlock === 0) {
    return;
  }

  await prisma.serviceStat.upsert({
    where: { name: serviceStatPropertyName },
    update: { value: lastBlock.toString() },
    create: { name: serviceStatPropertyName, value: lastBlock.toString() },
  });
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

// Reorg handling functions
async function getRecentBlocks(): Promise<RecentBlockHistory> {
  const stat = await prisma.serviceStat.findUnique({
    where: { name: RECENT_BLOCKS_KEY },
  });
  return stat ? JSON.parse(stat.value) : { blocks: [] };
}

async function saveRecentBlocks(history: RecentBlockHistory): Promise<void> {
  history.blocks = history.blocks.slice(0, REORG_DEPTH);
  await prisma.serviceStat.upsert({
    where: { name: RECENT_BLOCKS_KEY },
    update: { value: JSON.stringify(history) },
    create: { name: RECENT_BLOCKS_KEY, value: JSON.stringify(history) },
  });
}

async function checkForReorg(
  currentBlock: number,
  history: RecentBlockHistory
): Promise<{ reorged: boolean; reorgFromBlock?: number }> {
  const previousBlockNum = currentBlock - 1;
  const storedBlock = history.blocks.find((b) => b.number === previousBlockNum);

  if (!storedBlock) {
    return { reorged: false };
  }

  const chainBlock = await provider.getBlock(previousBlockNum);
  if (!chainBlock) {
    return { reorged: false };
  }

  if (chainBlock.hash === storedBlock.hash) {
    return { reorged: false };
  }

  // Reorg detected - find the earliest affected block
  let reorgFromBlock = storedBlock.number;

  for (const stored of history.blocks) {
    if (stored.number < reorgFromBlock) {
      const block = await provider.getBlock(stored.number);
      if (block && block.hash === stored.hash) {
        break;
      }
      reorgFromBlock = stored.number;
    }
  }

  return { reorged: true, reorgFromBlock };
}

async function deleteRecordsByTxids(txids: string[]): Promise<void> {
  if (txids.length === 0) return;

  console.log(`Deleting records from ${txids.length} transactions due to reorg`);

  // Find schema name attestations to handle specially
  const schemaNameAttestations = await prisma.attestation.findMany({
    where: { txid: { in: txids }, schemaId: schemaNameUID },
    select: { id: true, data: true, attester: true },
  });

  // Delete SchemaNames created by these attestations
  for (const att of schemaNameAttestations) {
    try {
      const decoded = ethers.utils.defaultAbiCoder.decode(
        ["bytes32", "string"],
        att.data
      );
      await prisma.schemaName.deleteMany({
        where: {
          schemaId: decoded[0],
          name: decoded[1],
          attesterAddress: att.attester,
        },
      });
    } catch {
      // Ignore decode errors
    }
  }

  // Delete in correct order for foreign key constraints
  await prisma.$transaction([
    prisma.attestation.deleteMany({ where: { txid: { in: txids } } }),
    prisma.schema.deleteMany({ where: { txid: { in: txids } } }),
    prisma.timestamp.deleteMany({ where: { txid: { in: txids } } }),
    prisma.offchainRevocation.deleteMany({ where: { txid: { in: txids } } }),
  ]);
}

function recordProcessedBlocks(
  logs: ethers.providers.Log[],
  history: RecentBlockHistory
): void {
  const blockMap = new Map<number, { hash: string; txids: Set<string> }>();

  for (const log of logs) {
    if (!blockMap.has(log.blockNumber)) {
      blockMap.set(log.blockNumber, {
        hash: log.blockHash,
        txids: new Set(),
      });
    }
    blockMap.get(log.blockNumber)!.txids.add(log.transactionHash);
  }

  for (const [blockNum, data] of blockMap) {
    history.blocks = history.blocks.filter((b) => b.number !== blockNum);
    history.blocks.unshift({
      number: blockNum,
      hash: data.hash,
      txids: Array.from(data.txids),
    });
  }

  history.blocks.sort((a, b) => b.number - a.number);
  history.blocks = history.blocks.slice(0, REORG_DEPTH);
}

export async function updateDbFromRelevantLog(log: ethers.providers.Log) {
  if (log.address === EASSchemaRegistryAddress) {
    if (
      log.topics[0] === ethers.utils.id(registeredEventSignatureV1) ||
      log.topics[0] === ethers.utils.id(registeredEventSignatureV2)
    ) {
      await createSchemasFromLogs([log]);
    }
  } else if (log.address === EASContractAddress) {
    if (log.topics[0] === ethers.utils.id(attestedEventSignature)) {
      await createAttestationsForLogs([log]);
    } else if (log.topics[0] === ethers.utils.id(revokedEventSignature)) {
      await revokeAttestationsFromLogs([log]);
    } else if (log.topics[0] === ethers.utils.id(timestampEventSignature)) {
      await createTimestampForLogs([log]);
    } else if (
      log.topics[0] === ethers.utils.id(revokedOffchainEventSignature)
    ) {
      await createOffchainRevocationsForLogs([log]);
    }
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export async function getAndUpdateAllRelevantLogs() {
  const eventSignatures = [
    ethers.utils.id(revokedEventSignature),
    ethers.utils.id(revokedOffchainEventSignature),
    ethers.utils.id(attestedEventSignature),
    ethers.utils.id(timestampEventSignature),
  ];

  const attestedSig = ethers.utils.id(attestedEventSignature);
  const revokedSig = ethers.utils.id(revokedEventSignature);
  const timestampSig = ethers.utils.id(timestampEventSignature);
  const revokedOffchainSig = ethers.utils.id(revokedOffchainEventSignature);

  const serviceStatPropertyName = "latestAttestationBlockNum";

  const { fromBlock } = await getStartData(serviceStatPropertyName);

  let currentBlock = fromBlock + 1;
  const latestBlock = await provider.getBlockNumber();

  // Progress tracking
  const totalBlocks = latestBlock - currentBlock + 1;
  const startTime = Date.now();
  let blocksProcessed = 0;
  let totalLogsProcessed = 0;

  if (totalBlocks <= 0) {
    console.log("Already up to date, no blocks to process");
    return;
  }

  console.log(
    `\nStarting sync: ${totalBlocks.toLocaleString()} blocks to process (${currentBlock} → ${latestBlock})\n`
  );

  // Load block history for reorg detection
  const blockHistory = await getRecentBlocks();
  while (currentBlock <= latestBlock) {
    // Check for reorg before processing
    const { reorged, reorgFromBlock } = await checkForReorg(
      currentBlock,
      blockHistory
    );

    if (reorged && reorgFromBlock) {
      console.log(`Reorg detected! Rolling back from block ${reorgFromBlock}`);

      const affectedTxids = blockHistory.blocks
        .filter((b) => b.number >= reorgFromBlock)
        .flatMap((b) => b.txids);

      await deleteRecordsByTxids(affectedTxids);

      blockHistory.blocks = blockHistory.blocks.filter(
        (b) => b.number < reorgFromBlock
      );
      currentBlock = reorgFromBlock;
      await updateServiceStatToLastBlock(serviceStatPropertyName, reorgFromBlock - 1);

      continue;
    }

    const toBlock = Math.min(currentBlock + batchSize - 1, latestBlock);
    const batchBlocks = toBlock - currentBlock + 1;

    // Calculate progress
    const percent = ((blocksProcessed / totalBlocks) * 100).toFixed(1);
    const elapsedSec = (Date.now() - startTime) / 1000;
    const blocksPerSec = blocksProcessed > 0 ? blocksProcessed / elapsedSec : 0;
    const remainingBlocks = totalBlocks - blocksProcessed;
    const etaSec = blocksPerSec > 0 ? remainingBlocks / blocksPerSec : 0;

    console.log(
      `[${percent}%] Block ${currentBlock.toLocaleString()} → ${toBlock.toLocaleString()} | ` +
        `${blocksProcessed.toLocaleString()}/${totalBlocks.toLocaleString()} blocks | ` +
        `${Math.round(blocksPerSec).toLocaleString()} blocks/s | ` +
        `ETA: ${formatDuration(etaSec)}`
    );

    // Fetch schema logs and EAS logs in parallel
    const [schemaLogs, easLogs] = await Promise.all([
      provider.getLogs({
        address: EASSchemaRegistryAddress,
        fromBlock: currentBlock,
        toBlock,
        topics: [
          [
            ethers.utils.id(registeredEventSignatureV1),
            ethers.utils.id(registeredEventSignatureV2),
          ],
        ],
      }),
      provider.getLogs({
        address: EASContractAddress,
        fromBlock: currentBlock,
        toBlock,
        topics: [eventSignatures],
      }),
    ]);

    // Process schemas first (attestations may reference them)
    if (schemaLogs.length > 0) {
      console.log(`Processing ${schemaLogs.length} schema logs in batch`);
      await createSchemasFromLogs(schemaLogs);
    }

    // Group EAS logs by event type for batch processing
    const attestLogs = easLogs.filter((l) => l.topics[0] === attestedSig);
    const revokeLogs = easLogs.filter((l) => l.topics[0] === revokedSig);
    const timestampLogs = easLogs.filter((l) => l.topics[0] === timestampSig);
    const offchainRevokeLogs = easLogs.filter(
      (l) => l.topics[0] === revokedOffchainSig
    );

    // Process each batch by type (more efficient than one-by-one dispatch)
    if (attestLogs.length > 0) {
      console.log(`Processing ${attestLogs.length} attestation logs in batch`);
      await createAttestationsForLogs(attestLogs);
    }

    if (revokeLogs.length > 0) {
      console.log(`Processing ${revokeLogs.length} revocation logs in batch`);
      await revokeAttestationsFromLogs(revokeLogs);
    }

    if (timestampLogs.length > 0) {
      console.log(`Processing ${timestampLogs.length} timestamp logs in batch`);
      await createTimestampForLogs(timestampLogs);
    }

    if (offchainRevokeLogs.length > 0) {
      console.log(
        `Processing ${offchainRevokeLogs.length} offchain revocation logs in batch`
      );
      await createOffchainRevocationsForLogs(offchainRevokeLogs);
    }

    // Record processed blocks for reorg detection
    recordProcessedBlocks([...schemaLogs, ...easLogs], blockHistory);

    await updateServiceStatToLastBlock(serviceStatPropertyName, toBlock);

    // Update progress counters
    blocksProcessed += batchBlocks;
    totalLogsProcessed += schemaLogs.length + easLogs.length;

    currentBlock += batchSize;
    await timeout(requestDelay);
  }

  // Save block history for reorg detection
  await saveRecentBlocks(blockHistory);

  // Final summary
  const totalElapsed = (Date.now() - startTime) / 1000;
  console.log(`\n✓ Sync complete!`);
  console.log(`  Blocks processed: ${blocksProcessed.toLocaleString()}`);
  console.log(`  Logs processed: ${totalLogsProcessed.toLocaleString()}`);
  console.log(`  Time elapsed: ${formatDuration(totalElapsed)}`);
  console.log(
    `  Average speed: ${Math.round(
      blocksProcessed / totalElapsed
    ).toLocaleString()} blocks/s\n`
  );
}

export async function updateDbFromEthTransaction(txId: string) {
  const tx = await provider.getTransactionReceipt(txId);

  if (!tx) {
    console.log("Transaction not found", txId);
    return;
  }

  for (const log of tx.logs) {
    await updateDbFromRelevantLog(log);
  }

  console.log("Processed logs for tx", txId);
}

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
    return;
  }

  // Fetch all attestation data from chain in parallel
  const attestationPromises = logs.map((log) =>
    limit(() => easContract.getAttestation(log.data))
  );
  const chainAttestations = await Promise.all(attestationPromises);

  // Get all attestation IDs
  const attestationIds = chainAttestations.map((a) => a[0]);

  // Batch check which attestations exist in DB
  const existingAttestations = await prisma.attestation.findMany({
    where: { id: { in: attestationIds } },
    select: { id: true },
  });
  const existingIdSet = new Set(existingAttestations.map((a) => a.id));

  // Find missing attestations and backfill them
  const missingIndices = chainAttestations
    .map((a, i) => (!existingIdSet.has(a[0]) ? i : -1))
    .filter((i) => i !== -1);

  if (missingIndices.length > 0) {
    console.log(
      `Backfilling ${missingIndices.length} missing attestations before revocation`
    );
    const backfillAttestations = await Promise.all(
      missingIndices.map((i) =>
        createAttestationFromChainData(
          chainAttestations[i],
          logs[i].transactionHash
        )
      )
    );
    await prisma.attestation.createMany({
      data: backfillAttestations,
      skipDuplicates: true,
    });
  }

  if (chainAttestations.length === 0) {
    return;
  }

  console.log(`Processing ${chainAttestations.length} revocations`);

  // Batch update all attestations using transaction
  const updatedAttestations = await prisma.$transaction(
    chainAttestations.map((attestation) =>
      prisma.attestation.update({
        where: { id: attestation[0] },
        data: {
          revoked: true,
          revocationTime: attestation.revocationTime.toNumber(),
        },
      })
    )
  );

  // Process schema names for revoked attestations
  for (const attestation of updatedAttestations) {
    await processRevokedAttestation(attestation);
  }
}

export async function createSchemasFromLogs(logs: ethers.providers.Log[]) {
  const promises = logs.map((log) =>
    limit(() => getFormattedSchemaFromLog(log))
  );

  const schemas = await Promise.all(promises);

  if (schemas.length === 0) {
    return;
  }

  // Get existing schema IDs in one query
  const existingIds = await prisma.schema.findMany({
    where: { id: { in: schemas.map((s) => s.id) } },
    select: { id: true },
  });
  const existingIdSet = new Set(existingIds.map((s) => s.id));

  // Filter to only new schemas
  const newSchemas = schemas.filter((s) => !existingIdSet.has(s.id));

  if (newSchemas.length === 0) {
    console.log(`All ${schemas.length} schemas already exist, skipping`);
    return;
  }

  // Get current count once for indexing
  const schemaCount = await prisma.schema.count();

  // Add index to each new schema
  const schemasWithIndex = newSchemas.map((schema, i) => ({
    ...schema,
    index: (schemaCount + i + 1).toString(),
  }));

  console.log(
    `Creating ${newSchemas.length} new schemas (${existingIdSet.size} already existed)`
  );

  // Batch insert all new schemas
  await prisma.schema.createMany({
    data: schemasWithIndex,
    skipDuplicates: true,
  });
}

export async function createAttestationsForLogs(logs: ethers.providers.Log[]) {
  const promises = logs.map((log) =>
    limit(() => getFormattedAttestationFromLog(log))
  );

  const attestations = await Promise.all(promises);
  const validAttestations = attestations.filter(
    (a): a is Attestation => a !== null
  );

  if (validAttestations.length === 0) {
    return;
  }

  // Get existing attestation IDs in one query to avoid N+1
  const existingIds = await prisma.attestation.findMany({
    where: { id: { in: validAttestations.map((a) => a.id) } },
    select: { id: true },
  });
  const existingIdSet = new Set(existingIds.map((a) => a.id));

  // Filter to only new attestations
  const newAttestations = validAttestations.filter(
    (a) => !existingIdSet.has(a.id)
  );

  if (newAttestations.length === 0) {
    console.log(
      `All ${validAttestations.length} attestations already exist, skipping`
    );
    return;
  }

  console.log(
    `Creating ${newAttestations.length} new attestations (${existingIdSet.size} already existed)`
  );

  // Batch insert all new attestations
  await prisma.attestation.createMany({
    data: newAttestations,
    skipDuplicates: true,
  });

  // Process schema names for newly created attestations
  for (const attestation of newAttestations) {
    await processCreatedAttestation(attestation);
  }
}

export async function createOffchainRevocationsForLogs(
  logs: ethers.providers.Log[]
) {
  if (logs.length === 0) {
    return;
  }

  // Fetch all transactions in parallel
  const txPromises = logs.map((log) =>
    limit(() => provider.getTransaction(log.transactionHash))
  );
  const transactions = await Promise.all(txPromises);

  // Prepare all revocation data
  const revocationData = logs.map((log, i) => {
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

  console.log(`Creating ${revocationData.length} offchain revocations`);

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
}

export async function createTimestampForLogs(logs: ethers.providers.Log[]) {
  if (logs.length === 0) {
    return;
  }

  // Fetch all transactions in parallel
  const txPromises = logs.map((log) =>
    limit(() => provider.getTransaction(log.transactionHash))
  );
  const transactions = await Promise.all(txPromises);

  console.log(`Processing ${logs.length} timestamps`);

  // Batch upsert using transaction
  await prisma.$transaction(
    logs.map((log, i) => {
      const uid = log.topics[1];
      const timestamp = ethers.BigNumber.from(log.topics[2]).toNumber();
      const tx = transactions[i];

      return prisma.timestamp.upsert({
        where: { id: uid },
        update: {
          timestamp,
          from: tx.from,
          txid: log.transactionHash,
        },
        create: {
          id: uid,
          timestamp,
          from: tx.from,
          txid: log.transactionHash,
        },
      });
    })
  );
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

  while (currentBlock <= latestBlock) {
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

    await updateServiceStatToLastBlock(serviceStatPropertyName, toBlock);

    // Update progress counters
    blocksProcessed += batchBlocks;
    totalLogsProcessed += schemaLogs.length + easLogs.length;

    currentBlock += batchSize;
    await timeout(requestDelay);
  }

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

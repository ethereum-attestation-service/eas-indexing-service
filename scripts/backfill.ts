import { ethers } from "ethers";
import {
  provider,
  CONTRACT_START_BLOCK,
  EASContractAddress,
  EASSchemaRegistryAddress,
  revokedEventSignature,
  revokedOffchainEventSignature,
  attestedEventSignature,
  timestampEventSignature,
  registeredEventSignatureV1,
  registeredEventSignatureV2,
  createSchemasFromLogs,
  createAttestationsForLogs,
  revokeAttestationsFromLogs,
  createTimestampForLogs,
  createOffchainRevocationsForLogs,
} from "../utils";

// Usage: npx ts-node scripts/backfill.ts [fromBlock] [toBlock]
// Examples:
//   npx ts-node scripts/backfill.ts              # Full re-index from CONTRACT_START_BLOCK
//   npx ts-node scripts/backfill.ts 18000000     # From block 18000000 to latest
//   npx ts-node scripts/backfill.ts 18000000 19000000  # Specific range

const batchSize = process.env.BATCH_SIZE ? Number(process.env.BATCH_SIZE) : 9500;
const requestDelay = process.env.REQUEST_DELAY ? Number(process.env.REQUEST_DELAY) : 0;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function timeout(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfill(fromBlock: number, toBlock: number) {
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

  let currentBlock = fromBlock;
  const totalBlocks = toBlock - fromBlock + 1;
  const startTime = Date.now();
  let blocksProcessed = 0;
  let totalLogsProcessed = 0;

  // Track totals for summary
  const totals = {
    schemas: { created: 0, existed: 0 },
    attestations: { created: 0, existed: 0 },
    revocations: { processed: 0, backfilled: 0 },
    timestamps: { created: 0, existed: 0 },
    offchainRevocations: { created: 0, existed: 0 },
  };

  console.log(
    `\n[BACKFILL] Starting: ${totalBlocks.toLocaleString()} blocks to process (${fromBlock} → ${toBlock})\n`
  );

  while (currentBlock <= toBlock) {
    const batchEnd = Math.min(currentBlock + batchSize - 1, toBlock);
    const batchBlocks = batchEnd - currentBlock + 1;

    const percent = ((blocksProcessed / totalBlocks) * 100).toFixed(1);
    const elapsedSec = (Date.now() - startTime) / 1000;
    const blocksPerSec = blocksProcessed > 0 ? blocksProcessed / elapsedSec : 0;
    const remainingBlocks = totalBlocks - blocksProcessed;
    const etaSec = blocksPerSec > 0 ? remainingBlocks / blocksPerSec : 0;

    console.log(
      `[${percent}%] Block ${currentBlock.toLocaleString()} → ${batchEnd.toLocaleString()} | ` +
        `${blocksProcessed.toLocaleString()}/${totalBlocks.toLocaleString()} blocks | ` +
        `${Math.round(blocksPerSec).toLocaleString()} blocks/s | ` +
        `ETA: ${formatDuration(etaSec)}`
    );

    const [schemaLogs, easLogs] = await Promise.all([
      provider.getLogs({
        address: EASSchemaRegistryAddress,
        fromBlock: currentBlock,
        toBlock: batchEnd,
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
        toBlock: batchEnd,
        topics: [eventSignatures],
      }),
    ]);

    // Process schemas first (attestations depend on them)
    if (schemaLogs.length > 0) {
      console.log(`  Processing ${schemaLogs.length} schema logs`);
      const result = await createSchemasFromLogs(schemaLogs);
      totals.schemas.created += result.created;
      totals.schemas.existed += result.existed;
    }

    const attestLogs = easLogs.filter((l) => l.topics[0] === attestedSig);
    const revokeLogs = easLogs.filter((l) => l.topics[0] === revokedSig);
    const timestampLogs = easLogs.filter((l) => l.topics[0] === timestampSig);
    const offchainRevokeLogs = easLogs.filter(
      (l) => l.topics[0] === revokedOffchainSig
    );

    if (attestLogs.length > 0) {
      console.log(`  Processing ${attestLogs.length} attestation logs`);
      const result = await createAttestationsForLogs(attestLogs);
      totals.attestations.created += result.created;
      totals.attestations.existed += result.existed;
    }

    if (revokeLogs.length > 0) {
      console.log(`  Processing ${revokeLogs.length} revocation logs`);
      const result = await revokeAttestationsFromLogs(revokeLogs);
      totals.revocations.processed += result.processed;
      totals.revocations.backfilled += result.backfilled;
    }

    if (timestampLogs.length > 0) {
      console.log(`  Processing ${timestampLogs.length} timestamp logs`);
      const result = await createTimestampForLogs(timestampLogs);
      totals.timestamps.created += result.created;
      totals.timestamps.existed += result.existed;
    }

    if (offchainRevokeLogs.length > 0) {
      console.log(`  Processing ${offchainRevokeLogs.length} offchain revocation logs`);
      const result = await createOffchainRevocationsForLogs(offchainRevokeLogs);
      totals.offchainRevocations.created += result.created;
      totals.offchainRevocations.existed += result.existed;
    }

    blocksProcessed += batchBlocks;
    totalLogsProcessed += schemaLogs.length + easLogs.length;
    currentBlock += batchSize;

    if (requestDelay > 0) {
      await timeout(requestDelay);
    }
  }

  const totalElapsed = (Date.now() - startTime) / 1000;
  console.log(`\n[BACKFILL] Complete!`);
  console.log(`  Blocks processed: ${blocksProcessed.toLocaleString()}`);
  console.log(`  Logs processed: ${totalLogsProcessed.toLocaleString()}`);
  console.log(`  Time elapsed: ${formatDuration(totalElapsed)}`);
  console.log(
    `  Average speed: ${Math.round(blocksProcessed / totalElapsed).toLocaleString()} blocks/s`
  );

  console.log(`\n  Summary:`);
  console.log(`    Schemas: ${totals.schemas.created.toLocaleString()} created, ${totals.schemas.existed.toLocaleString()} already existed`);
  console.log(`    Attestations: ${totals.attestations.created.toLocaleString()} created, ${totals.attestations.existed.toLocaleString()} already existed`);
  console.log(`    Revocations: ${totals.revocations.processed.toLocaleString()} processed, ${totals.revocations.backfilled.toLocaleString()} backfilled`);
  console.log(`    Timestamps: ${totals.timestamps.created.toLocaleString()} created, ${totals.timestamps.existed.toLocaleString()} already existed`);
  console.log(`    Offchain Revocations: ${totals.offchainRevocations.created.toLocaleString()} created, ${totals.offchainRevocations.existed.toLocaleString()} already existed\n`);
}

async function main() {
  const args = process.argv.slice(2);

  let fromBlock = CONTRACT_START_BLOCK;
  let toBlock = await provider.getBlockNumber();

  if (args[0]) {
    fromBlock = parseInt(args[0], 10);
    if (isNaN(fromBlock)) {
      console.error("Invalid fromBlock:", args[0]);
      process.exit(1);
    }
  }

  if (args[1]) {
    toBlock = parseInt(args[1], 10);
    if (isNaN(toBlock)) {
      console.error("Invalid toBlock:", args[1]);
      process.exit(1);
    }
  }

  if (fromBlock > toBlock) {
    console.error(`fromBlock (${fromBlock}) cannot be greater than toBlock (${toBlock})`);
    process.exit(1);
  }

  console.log(`[BACKFILL] Chain: ${process.env.CHAIN_ID}`);
  console.log(`[BACKFILL] Range: ${fromBlock} → ${toBlock}`);
  console.log(`[BACKFILL] Batch size: ${batchSize}`);

  await backfill(fromBlock, toBlock);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[BACKFILL] Error:", e);
    process.exit(1);
  });

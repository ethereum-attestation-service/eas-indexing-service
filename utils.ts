import { prisma } from "./db.server";
import { ethers } from "ethers";
import { Attestation, Schema } from "@prisma/client";
import dayjs from "dayjs";
import pLimit from "p-limit";
import { Eas__factory, EasSchema__factory } from "./types/ethers-contracts";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import * as fs from "fs";

const batchSize = process.env.BATCH_SIZE
  ? Number(process.env.BATCH_SIZE)
  : 9500;

const requestDelay = process.env.REQUEST_DELAY
  ? Number(process.env.REQUEST_DELAY)
  : 0;

const limit = pLimit(5);

// Add a constant for maximum retries
const MAX_RETRIES = 5;

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
    rpcProvider: `https://ancient-white-arrow.arbitrum-mainnet.discover.quiknode.pro/${process.env.QUICKNODE_ARBITRUM_API_KEY}/`,
  },
  {
    chainId: 42170,
    chainName: "arbitrum-nova",
    subdomain: "arbitrum-nova.",
    version: "1.3.0",
    contractAddress: "0x6d3dC0Fe5351087E3Af3bDe8eB3F7350ed894fc3",
    schemaRegistryAddress: "0x49563d0DA8DF38ef2eBF9C1167270334D72cE0AE",
    contractStartBlock: 44665679,
    etherscanURL: "https://nova.arbiscan.io/",
    rpcProvider: `https://frequent-boldest-hill.nova-mainnet.quiknode.pro/${process.env.QUICKNODE_ARBITRUM_NOVA_API_KEY}/`,
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
    version: "1.0.1",
    contractAddress: "0x4200000000000000000000000000000000000021",
    schemaRegistryAddress: "0x4200000000000000000000000000000000000020",
    contractStartBlock: 12236559,
    etherscanURL: "https://goerli-optimism.etherscan.io/",
    rpcProvider: `https://opt-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_OPTIMISM_GOERLI_API_KEY}`,
  },
  {
    chainId: 11155420,
    chainName: "optimism-sepolia",
    subdomain: "optimism-sepolia.",
    version: "1.0.2",
    contractAddress: "0x4200000000000000000000000000000000000021",
    schemaRegistryAddress: "0x4200000000000000000000000000000000000020",
    contractStartBlock: 4878430,
    etherscanURL: "https://sepolia-optimism.etherscan.io/",
    rpcProvider: `https://sepolia.optimism.io`,
  },
  {
    chainId: 10,
    chainName: "optimism",
    subdomain: "optimism.",
    version: "1.0.1",
    contractAddress: "0x4200000000000000000000000000000000000021",
    schemaRegistryAddress: "0x4200000000000000000000000000000000000020",
    contractStartBlock: 107476600,
    etherscanURL: "https://goerli-optimism.etherscan.io/",
    rpcProvider: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_OPTIMISM_API_KEY}`,
  },
  {
    chainId: 84531,
    chainName: "base-goerli",
    subdomain: "base-goerli-predeploy.",
    version: "1.0.1",
    contractAddress: "0x4200000000000000000000000000000000000021",
    schemaRegistryAddress: "0x4200000000000000000000000000000000000020",
    contractStartBlock: 9106610,
    etherscanURL: "https://goerli.basescan.org/",
    rpcProvider: `https://goerli.base.org`,
  },
  {
    chainId: 84532,
    chainName: "base-sepolia",
    subdomain: "base-sepolia.",
    version: "1.2.0",
    contractAddress: "0x4200000000000000000000000000000000000021",
    schemaRegistryAddress: "0x4200000000000000000000000000000000000020",
    contractStartBlock: 5252000,
    etherscanURL: "https://sepolia.basescan.org/",
    rpcProvider: `https://sepolia.base.org`,
  },
  {
    chainId: 8453,
    chainName: "base",
    subdomain: "base.",
    version: "1.0.1",
    contractAddress: "0x4200000000000000000000000000000000000021",
    schemaRegistryAddress: "0x4200000000000000000000000000000000000020",
    contractStartBlock: 3701279,
    etherscanURL: "https://basescan.org/",
    rpcProvider: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_BASE_API_KEY}`,
  },
  {
    chainId: 59144,
    chainName: "linea",
    subdomain: "linea.",
    version: "1.2.0",
    contractAddress: "0xaEF4103A04090071165F78D45D83A0C0782c2B2a",
    schemaRegistryAddress: "0x55D26f9ae0203EF95494AE4C170eD35f4Cf77797",
    contractStartBlock: 362819,
    etherscanURL: "https://lineascan.build/",
    rpcProvider: `https://linea-mainnet.infura.io/v3/${process.env.INFURA_LINEA_API_KEY}`,
  },
  // {
  //   chainId: 80001,
  //   chainName: "polygon-mumbai",
  //   subdomain: "polygon-mumbai.",
  //   version: "1.2.0",
  //   contractAddress: "0xaEF4103A04090071165F78D45D83A0C0782c2B2a",
  //   schemaRegistryAddress: "0x55D26f9ae0203EF95494AE4C170eD35f4Cf77797",
  //   contractStartBlock: 41442300,
  //   etherscanURL: "https://mumbai.polygonscan.com/",
  //   rpcProvider: `https://polygon-mumbai.infura.io/v3/${process.env.INFURA_API_KEY}`,
  // },
  {
    chainId: 80002,
    chainName: "polygon-amoy",
    subdomain: "polygon-amoy.",
    version: "1.3.0",
    contractAddress: "0xb101275a60d8bfb14529C421899aD7CA1Ae5B5Fc",
    schemaRegistryAddress: "0x23c5701A1BDa89C61d181BD79E5203c730708AE7",
    contractStartBlock: 7372405,
    etherscanURL: "https://amoy.polygonscan.com/",
    rpcProvider: `https://restless-palpable-mountain.matic-amoy.quiknode.pro/${process.env.QUICKNODE_POLYGON_AMOY_API_KEY}/`,
  },
  {
    chainId: 137,
    chainName: "polygon",
    subdomain: "polygon.",
    version: "1.3.0",
    contractAddress: "0x5E634ef5355f45A855d02D66eCD687b1502AF790",
    schemaRegistryAddress: "0x7876EEF51A891E737AF8ba5A5E0f0Fd29073D5a7",
    contractStartBlock: 51279760,
    etherscanURL: "https://polygonscan.com/",
    rpcProvider: `https://polygon-rpc.com`,
  },
  {
    chainId: 534352,
    chainName: "scroll",
    subdomain: "scroll.",
    version: "1.3.0",
    contractAddress: "0xC47300428b6AD2c7D03BB76D05A176058b47E6B0",
    schemaRegistryAddress: "0xD2CDF46556543316e7D34e8eDc4624e2bB95e3B6",
    contractStartBlock: 1317850,
    etherscanURL: "https://scrollscan.com/",
    rpcProvider: `https://skilled-powerful-sailboat.scroll-mainnet.quiknode.pro/${process.env.SCROLL_QUICKNODE_API_KEY}/`,
  },
  {
    chainId: 534351,
    chainName: "scroll-sepolia",
    subdomain: "scroll-sepolia.",
    version: "1.3.0",
    contractAddress: "0xaEF4103A04090071165F78D45D83A0C0782c2B2a",
    schemaRegistryAddress: "0x55D26f9ae0203EF95494AE4C170eD35f4Cf77797",
    contractStartBlock: 2436100,
    etherscanURL: "https://sepolia.scrollscan.com/",
    rpcProvider: `https://sepolia-rpc.scroll.io/`,
  },
  {
    chainId: 42220,
    chainName: "celo",
    subdomain: "celo.",
    version: "1.3.0",
    contractAddress: "0x72E1d8ccf5299fb36fEfD8CC4394B8ef7e98Af92",
    schemaRegistryAddress: "0x5ece93bE4BDCF293Ed61FA78698B594F2135AF34",
    contractStartBlock: 24646038,
    etherscanURL: "https://celoscan.io",
    rpcProvider: `https://forno.celo.org`,
  },
  {
    chainId: 324,
    chainName: "zksync",
    subdomain: "zksync.",
    version: "1.3.0",
    contractAddress: "0x21d8d4eE83b80bc0Cc0f2B7df3117Cf212d02901",
    schemaRegistryAddress: "0xB8566376dFe68B76FA985D5448cc2FbD578412a2",
    contractStartBlock: 32837640,
    etherscanURL: "https://explorer.zksync.io",
    rpcProvider: `https://mainnet.era.zksync.io`,
  },
  {
    chainId: 763373,
    chainName: "ink-sepolia",
    subdomain: "ink-sepolia.",
    version: "1.4.1-beta.1",
    contractAddress: "0x4200000000000000000000000000000000000021",
    schemaRegistryAddress: "0x4200000000000000000000000000000000000020",
    contractStartBlock: 2083241,
    etherscanURL: "https://sepolia.ink.explorer.io",
    rpcProvider: `https://maximum-dimensional-dust.ink-sepolia.quiknode.pro/${process.env.QUICKNODE_INK_SEPOLIA_API_KEY}/`,
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
      console.log(
        `Max retries reached for log ${log.transactionHash}. Skipping...`
      );
      return null; // Exit the loop and return null after max retries
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
      return null;
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
  for (let log of logs) {
    const attestation = await easContract.getAttestation(log.data);

    const attestationFromDb = await prisma.attestation.findUnique({
      where: { id: attestation[0] },
    });

    if (!attestationFromDb) {
      console.log("Attestation not found in DB", attestation[0]);

      // Should never happen, but log it just in case
      fs.appendFileSync(
        "attestations_not_found_for_revoke.txt",
        `${attestation[0]}\n`
      );

      continue;
    }

    const updatedAttestatrion = await prisma.attestation.update({
      where: { id: attestation[0] },
      data: {
        revoked: true,
        revocationTime: attestation.revocationTime.toNumber(),
      },
    });

    await processRevokedAttestation(updatedAttestatrion);
  }
}

export async function createSchemasFromLogs(logs: ethers.providers.Log[]) {
  const promises = logs.map((log) =>
    limit(() => getFormattedSchemaFromLog(log))
  );

  const schemas = await Promise.all(promises);

  let schemaCount = await prisma.schema.count();

  for (let schema of schemas) {
    schemaCount++;

    console.log("Creating new schema", schema);
    try {
      await prisma.schema.create({
        data: { ...schema, index: schemaCount.toString() },
      });
    } catch (error) {
      console.log("Error creating schema", error);
    }
  }
}

export async function createAttestationsForLogs(logs: ethers.providers.Log[]) {
  const promises = logs.map((log) =>
    limit(() => getFormattedAttestationFromLog(log))
  );

  const attestations = await Promise.all(promises);

  for (let attestation of attestations) {
    if (attestation !== null) {
      const existingAttestation = await prisma.attestation.findUnique({
        where: { id: attestation.id },
      });

      if (existingAttestation) {
        console.log("Attestation already exists", attestation.id);
      } else {
        console.log("Creating new attestation", attestation);

        await prisma.attestation.create({ data: attestation });
        await processCreatedAttestation(attestation);
      }
    } else {
      console.log("Skipped creating attestation due to max retries.");
    }
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
  shouldCreate: boolean,
  serviceStatPropertyName: string,
  lastBlock: number
) {
  const existing = await prisma.serviceStat.findFirst({
    where: { name: serviceStatPropertyName },
  });

  if (!existing || shouldCreate) {
    await prisma.serviceStat.create({
      data: { name: serviceStatPropertyName, value: lastBlock.toString() },
    });
  } else {
    if (lastBlock !== 0 && lastBlock > Number(existing.value)) {
      await prisma.serviceStat.update({
        where: { name: serviceStatPropertyName },
        data: { value: lastBlock.toString() },
      });
    }
  }
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

export async function getAndUpdateAllRelevantLogs() {
  const eventSignatures = [
    ethers.utils.id(revokedEventSignature),
    ethers.utils.id(revokedOffchainEventSignature),
    ethers.utils.id(attestedEventSignature),
    ethers.utils.id(timestampEventSignature),
  ];

  const serviceStatPropertyName = "latestAttestationBlockNum";

  const { fromBlock } = await getStartData(serviceStatPropertyName);

  let currentBlock = fromBlock + 1;
  const latestBlock = await provider.getBlockNumber();

  let allLogs: ethers.providers.Log[] = [];

  while (currentBlock <= latestBlock) {
    const toBlock = Math.min(currentBlock + batchSize - 1, latestBlock);

    console.log(
      `Getting and updating all relevant logs from block ${currentBlock} to ${toBlock}`
    );

    const schemaLogs = await provider.getLogs({
      address: EASSchemaRegistryAddress,
      fromBlock: currentBlock,
      toBlock,
      topics: [
        [
          ethers.utils.id(registeredEventSignatureV1),
          ethers.utils.id(registeredEventSignatureV2),
        ],
      ],
    });

    allLogs = allLogs.concat(schemaLogs);

    for (const log of schemaLogs) {
      await updateDbFromRelevantLog(log);
      await timeout(requestDelay);
    }

    const easLogs = await provider.getLogs({
      address: EASContractAddress,
      fromBlock: currentBlock,
      toBlock,
      topics: [eventSignatures], // Filter by all event signatures
    });

    allLogs = allLogs.concat(easLogs);

    for (const log of easLogs) {
      await updateDbFromRelevantLog(log);
      await timeout(requestDelay);
    }

    await updateServiceStatToLastBlock(false, serviceStatPropertyName, toBlock);

    currentBlock += batchSize;
    await timeout(requestDelay);
  }

  console.log("total  logs", allLogs.length);
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

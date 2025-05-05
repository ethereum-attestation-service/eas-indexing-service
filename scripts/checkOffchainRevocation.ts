import { prisma } from "../db.server";
import { ethers } from "ethers";
import { Eas__factory } from "../types/ethers-contracts";
import { EAS_CHAIN_CONFIGS, CHAIN_ID } from "../utils";

// This script checks if a specific offchain attestation has been revoked and updates the database

const input = process.argv[2];

if (!input) {
  console.error("Please provide an attestation UID");
  process.exit(1);
}

const attestationUID = input;

async function checkAndUpdateRevocationStatus() {
  try {
    // Get the attestation from database
    const attestation = await prisma.attestation.findUnique({
      where: { id: attestationUID },
    });

    if (!attestation) {
      console.error(
        `Attestation with UID ${attestationUID} not found in database`
      );
      process.exit(1);
    }

    if (!attestation.isOffchain) {
      console.error(
        `Attestation with UID ${attestationUID} is not an offchain attestation`
      );
      process.exit(1);
    }

    // Get chain configuration
    const activeChainConfig = EAS_CHAIN_CONFIGS.find(
      (config) => config.chainId === CHAIN_ID
    );

    if (!activeChainConfig) {
      throw new Error("No chain config found for chain ID");
    }

    // Create provider and contract instance
    const provider = new ethers.providers.StaticJsonRpcProvider(
      activeChainConfig.rpcProvider,
      activeChainConfig.chainId
    );

    const easContract = Eas__factory.connect(
      activeChainConfig.contractAddress,
      provider
    );

    // Check if the attestation is revoked
    const revocationTime = await easContract.getRevokeOffchain(
      attestation.attester,
      attestationUID
    );
    const isRevoked = !revocationTime.isZero();
    const revocationTimeNumber = revocationTime.toNumber();

    console.log(
      `Checking revocation status for attestation: ${attestationUID}`
    );
    console.log(`Attester: ${attestation.attester}`);
    console.log(`Is revoked: ${isRevoked}`);
    console.log(`Revocation time: ${revocationTimeNumber}`);

    // Update the database if revocation status has changed
    if (
      isRevoked &&
      (!attestation.revoked ||
        attestation.revocationTime !== revocationTimeNumber)
    ) {
      console.log(`Updating attestation ${attestationUID} as revoked`);

      await prisma.attestation.update({
        where: { id: attestationUID },
        data: {
          revoked: true,
          revocationTime: revocationTimeNumber,
        },
      });

      // Create an entry in the offchainRevocation table
      await prisma.offchainRevocation.create({
        data: {
          uid: attestationUID,
          from: attestation.attester,
          timestamp: revocationTimeNumber,
          txid: "", // No transaction ID for manual checks
        },
      });

      console.log("Database updated successfully");
    } else {
      console.log(
        "No database update needed, revocation status is already correct"
      );
    }
  } catch (error) {
    console.error("Error checking revocation status:", error);
    process.exit(1);
  }
}

checkAndUpdateRevocationStatus()
  .then(() => {
    console.log("Process completed successfully");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Unexpected error:", e);
    process.exit(1);
  });

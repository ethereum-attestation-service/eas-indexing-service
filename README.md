# EAS Indexing Service

This tool allows you to quickly spin up your own EAS indexer on any EVM chain that has EAS contracts deployed

## Installation

First, clone the repository and install dependencies:

```bash
yarn install
```

You'll need to create a `.env` file in the root directory of the project. This file should contain the following variables,
which you can find in `.env.example` as well:

```dotenv
DATABASE_URL=postgresql://user:password@localhost:5432/eas-sepolia
INFURA_API_KEY=
INFURA_IPFS_USER=
INFURA_IPFS_PASS=
ALCHEMY_ARBITRUM_API_KEY=
ALCHEMY_SEPOLIA_API_KEY=
ALCHEMY_OPTIMISM_GOERLI_API_KEY=
#POLLING_INTERVAL=60000
#DISABLE_LISTENER=true
#REQUEST_DELAY=500 # How many ms to wait before making a request to RPC (useful for free plans)
#BATCH_SIZE=2000 # How many blocks to fetch at once (some providers have limits)

# Sepolia
CHAIN_ID=11155111
```
Here you'll want to set `CHAIN_ID` to the chain you want to index. Make sure that `CHAIN_ID` has an associated
config defined as an entry on `EAS_CHAIN_CONFIGS` in `utils.ts`.

Then generate the necessary files for Prisma:

```bash
SKIP_PRISMA_VERSION_CHECK=true npx prisma generate
````

You'll need to skip the version check due to the usage of the `typegraphql-prisma` package. Read more at 
[Prisma version verification](https://prisma.typegraphql.com/docs/basics/prisma-version).

Then you can start the Docker services:

```bash
docker-compose up -d
````

If you end up making any changes to this project's files, like adding your own chain config, remember to rebuild the
Docker containers so that the changes get redeployed:

```bash
docker-compose build
docker-compose up -d
```


## Adding custom chain configs

If you're running a Hardhat node locally, you'll need to add a new listing to the `EAS_CHAIN_CONFIGS` located in
`utils.ts`. Just copy one of the existing configs and change the values to match your chain.

## Localhost testing

If you're running a chain locally using something like Hardhat, you'll need to use a special url to reach the node
from inside the Docker container. You can use the `host.docker.internal` hostname to reach it.

So instead of `http://localhost:8545` you'll use `http://host.docker.internal:8545`.

## Yarn gotchas

If you're using Yarn and your packages are not linking correctly due to no `node_modules` folder being present, you can
add a `.yarnrc.yml` file to the root of the project with the following contents:

```yaml 
nodeLinker: node-modules
```




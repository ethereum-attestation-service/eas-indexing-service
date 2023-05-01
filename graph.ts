import "reflect-metadata";
import {
  resolvers,
  applyResolversEnhanceMap,
  ResolversEnhanceMap,
} from "@generated/type-graphql";
import { AuthChecker, Authorized, buildSchema } from "type-graphql";
import { ApolloServer } from "apollo-server";
import { prisma } from "./db.server";

const PORT = process.env.GRAPH_PORT || 4000;

export async function startGraph() {
  const resolversEnhanceMap: ResolversEnhanceMap = {
    Attestation: {
      attestation: [Authorized()],
      attestations: [Authorized()],
      findFirstAttestation: [Authorized()],
      aggregateAttestation: [Authorized()],
      createOneAttestation: [Authorized(["ADMIN"])],
      createManyAttestation: [Authorized(["ADMIN"])],
      upsertOneAttestation: [Authorized(["ADMIN"])],
      updateOneAttestation: [Authorized(["ADMIN"])],
      updateManyAttestation: [Authorized(["ADMIN"])],
      deleteOneAttestation: [Authorized(["ADMIN"])],
      deleteManyAttestation: [Authorized(["ADMIN"])],
    },
    Schema: {
      schema: [Authorized()],
      schemata: [Authorized()],
      findFirstSchema: [Authorized()],
      aggregateSchema: [Authorized()],
      createOneSchema: [Authorized(["ADMIN"])],
      createManySchema: [Authorized(["ADMIN"])],
      upsertOneSchema: [Authorized(["ADMIN"])],
      updateOneSchema: [Authorized(["ADMIN"])],
      updateManySchema: [Authorized(["ADMIN"])],
      deleteOneSchema: [Authorized(["ADMIN"])],
      deleteManySchema: [Authorized(["ADMIN"])],
    },
    EnsName: {
      ensName: [Authorized()],
      ensNames: [Authorized()],
      findFirstEnsName: [Authorized()],
      aggregateEnsName: [Authorized()],
      createOneEnsName: [Authorized(["ADMIN"])],
      createManyEnsName: [Authorized(["ADMIN"])],
      upsertOneEnsName: [Authorized(["ADMIN"])],
      updateOneEnsName: [Authorized(["ADMIN"])],
      updateManyEnsName: [Authorized(["ADMIN"])],
      deleteOneEnsName: [Authorized(["ADMIN"])],
      deleteManyEnsName: [Authorized(["ADMIN"])],
    },
    OffchainRevocation: {
      offchainRevocation: [Authorized()],
      offchainRevocations: [Authorized()],
      findFirstOffchainRevocation: [Authorized()],
      aggregateOffchainRevocation: [Authorized()],
      createOneOffchainRevocation: [Authorized(["ADMIN"])],
      createManyOffchainRevocation: [Authorized(["ADMIN"])],
      upsertOneOffchainRevocation: [Authorized(["ADMIN"])],
      updateOneOffchainRevocation: [Authorized(["ADMIN"])],
      updateManyOffchainRevocation: [Authorized(["ADMIN"])],
      deleteOneOffchainRevocation: [Authorized(["ADMIN"])],
      deleteManyOffchainRevocation: [Authorized(["ADMIN"])],
    },
    Timestamp: {
      timestamp: [Authorized()],
      timestamps: [Authorized()],
      findFirstTimestamp: [Authorized()],
      aggregateTimestamp: [Authorized()],
      createOneTimestamp: [Authorized(["ADMIN"])],
      createManyTimestamp: [Authorized(["ADMIN"])],
      upsertOneTimestamp: [Authorized(["ADMIN"])],
      updateOneTimestamp: [Authorized(["ADMIN"])],
      updateManyTimestamp: [Authorized(["ADMIN"])],
      deleteOneTimestamp: [Authorized(["ADMIN"])],
      deleteManyTimestamp: [Authorized(["ADMIN"])],
    },
    SchemaName: {
      schemaName: [Authorized()],
      schemaNames: [Authorized()],
      findFirstSchemaName: [Authorized()],
      aggregateSchemaName: [Authorized()],
      createOneSchemaName: [Authorized(["ADMIN"])],
      createManySchemaName: [Authorized(["ADMIN"])],
      upsertOneSchemaName: [Authorized(["ADMIN"])],
      updateOneSchemaName: [Authorized(["ADMIN"])],
      updateManySchemaName: [Authorized(["ADMIN"])],
      deleteOneSchemaName: [Authorized(["ADMIN"])],
      deleteManySchemaName: [Authorized(["ADMIN"])],
    },
    ServiceStat: {
      serviceStat: [Authorized()],
      serviceStats: [Authorized()],
      findFirstServiceStat: [Authorized()],
      aggregateServiceStat: [Authorized()],
      createOneServiceStat: [Authorized(["ADMIN"])],
      createManyServiceStat: [Authorized(["ADMIN"])],
      upsertOneServiceStat: [Authorized(["ADMIN"])],
      updateOneServiceStat: [Authorized(["ADMIN"])],
      updateManyServiceStat: [Authorized(["ADMIN"])],
      deleteOneServiceStat: [Authorized(["ADMIN"])],
      deleteManyServiceStat: [Authorized(["ADMIN"])],
    },
  };

  applyResolversEnhanceMap(resolversEnhanceMap);

  const customAuthChecker: AuthChecker = (
    { root, args, context, info },
    roles
  ) => {
    return !roles.includes("ADMIN");
  };

  const schema = await buildSchema({
    resolvers: resolvers,
    validate: false,
    authChecker: customAuthChecker,
  });

  const server = new ApolloServer({
    schema: schema,
    cache: "bounded",
    introspection: true,
    context: () => ({ prisma }),
  });

  const { url } = await server.listen(PORT);
  console.log(`Server is running, GraphQL Playground available at ${url}`);
}

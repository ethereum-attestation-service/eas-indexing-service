export const easAbi = [
  {
    inputs: [
      {
        internalType: "contract ISchemaRegistry",
        name: "registry",
        type: "address",
      },
      {
        internalType: "contract IEIP712Verifier",
        name: "verifier",
        type: "address",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "AccessDenied",
    type: "error",
  },
  {
    inputs: [],
    name: "AlreadyRevoked",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidAttestation",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidExpirationTime",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidOffset",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidRegistry",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidRevocation",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidSchema",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidVerifier",
    type: "error",
  },
  {
    inputs: [],
    name: "NotFound",
    type: "error",
  },
  {
    inputs: [],
    name: "NotPayable",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "recipient",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "attester",
        type: "address",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "uuid",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "schema",
        type: "bytes32",
      },
    ],
    name: "Attested",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "recipient",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "attester",
        type: "address",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "uuid",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "schema",
        type: "bytes32",
      },
    ],
    name: "Revoked",
    type: "event",
  },
  {
    inputs: [],
    name: "VERSION",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "recipient",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "schema",
        type: "bytes32",
      },
      {
        internalType: "uint32",
        name: "expirationTime",
        type: "uint32",
      },
      {
        internalType: "bytes32",
        name: "refUUID",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
    ],
    name: "attest",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "recipient",
        type: "address",
      },
      {
        internalType: "bytes32",
        name: "schema",
        type: "bytes32",
      },
      {
        internalType: "uint32",
        name: "expirationTime",
        type: "uint32",
      },
      {
        internalType: "bytes32",
        name: "refUUID",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
      {
        internalType: "address",
        name: "attester",
        type: "address",
      },
      {
        internalType: "uint8",
        name: "v",
        type: "uint8",
      },
      {
        internalType: "bytes32",
        name: "r",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "s",
        type: "bytes32",
      },
    ],
    name: "attestByDelegation",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "uuid",
        type: "bytes32",
      },
    ],
    name: "getAttestation",
    outputs: [
      {
        components: [
          {
            internalType: "bytes32",
            name: "uuid",
            type: "bytes32",
          },
          {
            internalType: "bytes32",
            name: "schema",
            type: "bytes32",
          },
          {
            internalType: "bytes32",
            name: "refUUID",
            type: "bytes32",
          },
          {
            internalType: "uint32",
            name: "time",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "expirationTime",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "revocationTime",
            type: "uint32",
          },
          {
            internalType: "address",
            name: "recipient",
            type: "address",
          },
          {
            internalType: "address",
            name: "attester",
            type: "address",
          },
          {
            internalType: "bytes",
            name: "data",
            type: "bytes",
          },
        ],
        internalType: "struct Attestation",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getEIP712Verifier",
    outputs: [
      {
        internalType: "contract IEIP712Verifier",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getSchemaRegistry",
    outputs: [
      {
        internalType: "contract ISchemaRegistry",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "uuid",
        type: "bytes32",
      },
    ],
    name: "isAttestationValid",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "uuid",
        type: "bytes32",
      },
    ],
    name: "revoke",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "uuid",
        type: "bytes32",
      },
      {
        internalType: "address",
        name: "attester",
        type: "address",
      },
      {
        internalType: "uint8",
        name: "v",
        type: "uint8",
      },
      {
        internalType: "bytes32",
        name: "r",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "s",
        type: "bytes32",
      },
    ],
    name: "revokeByDelegation",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

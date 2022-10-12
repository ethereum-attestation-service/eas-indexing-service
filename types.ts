export interface AttestationType {
  /** Attestation UUID */
  id: string;
  data: string;
  schema: SchemaType;
  recipient: string;
  attester: string;
  /** Unix timestamp */
  time: number;
  expirationTime: string;
  revocationTime: string;
  refUUID: string;
  revoked: boolean;
  txid: string;
}

export interface SchemaType {
  /** Schema UUID */
  id: string;
  schemaData: string;
  schema: string;
  /** Eth address of the attestor */
  creator: string;
  resolver: string;
  index: number;
  txid: string;
  time: number;
}

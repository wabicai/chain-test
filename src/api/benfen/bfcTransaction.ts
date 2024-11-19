import type { CommonParams, Response } from "../../types/params";

export type BfcTransactionPayload = {
  from: string;
  to: string;
  value: string | number;
  gasLimit?: string;
  gasPrice?: string;
  data?: string;
  nonce?: string | number;
};

export type BfcSignedTx = {
  rawTx: string;
  txHash: string;
  signature: {
    r: string;
    s: string;
    v: number;
  };
};

export type BfcTransactionParams = {
  payload: BfcTransactionPayload;
  showOnOneKey?: boolean;
};

export declare function bfcTransaction(
  connectId: string,
  deviceId: string,
  params: CommonParams & BfcTransactionParams
): Response<BfcSignedTx>;

export declare function bfcTransaction(
  connectId: string,
  deviceId: string,
  params: CommonParams & { bundle?: BfcTransactionParams[] }
): Response<Array<BfcSignedTx>>;

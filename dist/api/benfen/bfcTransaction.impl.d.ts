import { CommonParams } from "../../types/params";
import { BfcSignedTx, BfcTransactionParams } from "./bfcTransaction";
export declare class BfcTransactionImpl {
    private client;
    private keypair;
    constructor(privateKey?: string);
    sendTransaction(params: CommonParams & BfcTransactionParams): Promise<BfcSignedTx>;
    private validateParams;
}

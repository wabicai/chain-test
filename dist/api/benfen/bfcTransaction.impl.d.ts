import { CommonParams } from "../../types/params";
import { BfcSignedTx, BfcTransactionParams } from "./bfcTransaction";
export declare const TOKEN_INFO: {
    BFC: {
        address: string;
        decimals: number;
        symbol: string;
        name: string;
        logoURI: string;
    };
    BUSD: {
        address: string;
        decimals: number;
        symbol: string;
        name: string;
        logoURI: string;
    };
    "BFC-USDT": {
        address: string;
        decimals: number;
        symbol: string;
        name: string;
        logoURI: string;
    };
    "BFC-USDC": {
        address: string;
        decimals: number;
        symbol: string;
        name: string;
        logoURI: string;
    };
};
export declare class BfcTransactionImpl {
    private client;
    private keypair;
    constructor(privateKey?: string);
    sendTransaction(params: CommonParams & BfcTransactionParams): Promise<BfcSignedTx>;
    private validateParams;
}

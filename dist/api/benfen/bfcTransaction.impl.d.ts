import { CommonParams } from "../../types/params";
import { BfcSignedTx, BfcTransactionParams } from "./bfcTransaction";
export declare const TOKEN_INFO: {
    BFC: {
        address: string;
        decimals: number;
        symbol: string;
        name: string;
    };
    BUSD: {
        address: string;
        decimals: number;
        symbol: string;
        name: string;
    };
    BJPY: {
        address: string;
        decimals: number;
        symbol: string;
        name: string;
    };
    LONG: {
        address: string;
        decimals: number;
        symbol: string;
        name: string;
    };
    USDC: {
        address: string;
        decimals: number;
        symbol: string;
        name: string;
    };
};
export declare function normalizeBenfenCoinType(coinType: string): string;
export declare class BfcTransactionImpl {
    private client;
    private keypair;
    constructor(privateKey?: string);
    sendTransaction(params: CommonParams & BfcTransactionParams): Promise<BfcSignedTx>;
    private validateParams;
    splitTokenCoin(address: string, amounts: bigint[], tokenSymbol?: "BUSD" | "BFC"): Promise<void>;
}

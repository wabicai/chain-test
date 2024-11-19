"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bfcTransaction_impl_1 = require("../api/benfen/bfcTransaction.impl");
const logger_1 = require("../utils/logger");
async function main() {
    try {
        const privateKey = "benfenprivkey1qqld4glnppa4ksw7chap3z9x5l2sd2jl2le96r0aj8nqcd2q3e6yxlnl2km";
        const bfcImpl = new bfcTransaction_impl_1.BfcTransactionImpl(privateKey);
        const txParams = {
            payload: {
                from: "BFC40e481aec3350c696baad5599489615e20c9654205ba4bfba7bd3588fdbe027f96a2",
                to: "BFC01a2ca320af7932b8575eebbc265e0f75c91ccfc7148677ebb00e1872244ec0cacb4",
                value: "1",
                gasLimit: "21000",
                data: "0x",
            },
            showOnOneKey: true,
            chainId: 1,
            path: "m/44'/728'/0'/0/0",
        };
        logger_1.logger.info("Starting BFC transfer with params:", txParams);
        const result = await bfcImpl.sendTransaction(txParams);
        logger_1.logger.info("Transaction completed:", {
            txHash: result.txHash,
            rawTx: result.rawTx,
            signature: result.signature,
        });
    }
    catch (error) {
        logger_1.logger.error("Transfer failed:", error);
    }
}
main();

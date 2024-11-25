import { BfcTransactionImpl } from "../api/benfen/bfcTransaction.impl";
import { logger } from "../utils/logger";

async function main() {
  try {
    const privateKey =
      "2c59ac9ab2cb4eba4f23521652dd47490f28e644798bd093e091ce024853056a6e9c9ef745cc3a250168db15526d18075dc52849d49f8a6ea5477c1c264b4848";
    const bfcImpl = new BfcTransactionImpl(privateKey);

    const txParams = {
      payload: {
        from: "BFCb4ced58018b75d7ba72a10fa97c09b7bf66533ff104bf9db1bfdb004b17d8eaa2e35",
        to: "BFC17f3a9bd36da0639153d3c38032217ea298eb1991e0a62cc5924e2dd712937359128",
        value: "0.01",
        gasLimit: "21000",
        data: "0x",
      },
      chainId: 1,
      path: "m/44'/728'/0'/0/0",
    };

    // await bfcImpl.splitTokenCoin(
    //   txParams.payload.from,
    //   [
    //     10000000n, // 0.01 BFC
    //     20000000n, // 0.02 BFC
    //     30000000n, // 0.03 BFC
    //   ],
    //   "BFC"
    // );

    logger.info("Starting BFC transfer with params:", txParams);
    const result = await bfcImpl.sendTransaction(txParams);
    logger.info("Transaction completed:", {
      txHash: result.txHash,
      rawTx: result.rawTx,
      signature: result.signature,
    });
  } catch (error) {
    logger.error("Transfer failed:", error);
  }
}

main();

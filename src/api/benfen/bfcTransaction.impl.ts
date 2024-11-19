import { getFullnodeUrl, BenfenClient } from "@benfen/bfc.js/client";
import {
  TransactionBlock,
  TransactionObjectArgument,
} from "@benfen/bfc.js/transactions";
import { Ed25519Keypair } from "@benfen/bfc.js/keypairs/ed25519";
import { logger } from "../../utils/logger";
import { CommonParams } from "../../types/params";
import { BfcSignedTx, BfcTransactionParams } from "./bfcTransaction";
import { decodeBenfenPrivateKey } from "@benfen/bfc.js/cryptography";

export class BfcTransactionImpl {
  private client: BenfenClient;
  private keypair: Ed25519Keypair;

  constructor(privateKey?: string) {
    this.client = new BenfenClient({
      url: getFullnodeUrl("testnet"),
    });

    if (privateKey) {
      // 使用传入的私钥
      const decoded = decodeBenfenPrivateKey(privateKey);
      this.keypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
    } else {
      // 测试用私钥
      this.keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(1));
    }
  }

  async sendTransaction(
    params: CommonParams & BfcTransactionParams
  ): Promise<BfcSignedTx> {
    try {
      logger.debug("Starting transaction process with params:", params);
      this.validateParams(params);

      const { payload } = params;
      const tx = new TransactionBlock();

      const gasCoins = await this.client.getCoins({
        owner: payload.from,
        coinType: "0x2::bfc::BFC",
      });

      if (!gasCoins.data || gasCoins.data.length === 0) {
        throw new Error("No gas coins found for the account");
      }

      tx.setGasPayment(
        gasCoins.data.map((coin) => ({
          objectId: coin.coinObjectId,
          version: coin.version,
          digest: coin.digest,
        }))
      );

      tx.setSender(payload.from);

      const amountInMist = BigInt(parseFloat(payload.value.toString()) * 1e9);
      const [primaryCoin] = tx.splitCoins(tx.gas, [
        tx.pure(amountInMist.toString()),
      ]);
      tx.transferObjects([primaryCoin], tx.pure(payload.to));

      const txBytes = await tx.build({
        client: this.client,
        onlyTransactionKind: false,
      });

      logger.debug("Transaction bytes:", txBytes);
      // 使用 keypair 签名替代硬件签名
      const { signature } = await this.keypair.signTransactionBlock(txBytes);
      logger.debug("Transaction signature:", signature);
      const response = await this.client.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: signature,
      });

      return {
        rawTx: Buffer.from(txBytes).toString("hex"),
        txHash: response.digest,
        signature: {
          r: signature.slice(0, 64),
          s: signature.slice(64, 128),
          v: 0,
        },
      };
    } catch (error: any) {
      logger.error("Transaction failed:", error);
      throw new Error(`Transaction failed: ${error.message}`);
    }
  }

  private validateParams(params: CommonParams & BfcTransactionParams): void {
    const { payload } = params;
    if (!payload.from || !payload.to || !payload.value) {
      throw new Error("Missing required transaction parameters");
    }
  }
}

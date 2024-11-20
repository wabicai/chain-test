import { getFullnodeUrl, BenfenClient } from "@benfen/bfc.js/client";
import {
  TransactionBlock,
  TransactionObjectArgument,
} from "@benfen/bfc.js/transactions";
import { Ed25519Keypair } from "@benfen/bfc.js/keypairs/ed25519";
import { logger } from "../../utils/logger";
import { CommonParams } from "../../types/params";
import { BfcSignedTx, BfcTransactionParams } from "./bfcTransaction";
import {
  decodeBenfenPrivateKey,
  IntentScope,
  messageWithIntent,
} from "@benfen/bfc.js/cryptography";
export const TOKEN_INFO = {
  BFC: {
    address: "0x2::bfc::BFC",
    decimals: 9,
    symbol: "BFC",
    name: "BFC",
    logoURI:
      "https://obstatic.243096.com/mili/images/currency/chain/Benfen2.png",
  },
  BUSD: {
    address:
      "BFC00000000000000000000000000000000000000000000000000000000000000c8e30a::busd::BUSD",
    decimals: 9,
    symbol: "BUSD",
    name: "Benfen USD",
    logoURI:
      "https://obstatic.243096.com/download/token/images/BenfenTEST/BFC00000000000000000000000000000000000000000000000000000000000000c8e30a::busd::BUSD.png",
  },
  "BFC-USDT": {
    address:
      "BFC000000000000000000000000000000000000000000000000000000000000000268e4::bf_usdt::BF_USDT",
    decimals: 9,
    symbol: "BFC-USDT",
    name: "Benfen USDT",
    logoURI:
      "https://obstatic.243096.com/download/token/images/BenfenTEST/BFC000000000000000000000000000000000000000000000000000000000000000268e4::bf_usdt::BF_USDT.png",
  },
  "BFC-USDC": {
    address:
      "BFC000000000000000000000000000000000000000000000000000000000000000268e4::bf_usdc::BF_USDC",
    decimals: 9,
    symbol: "BFC-USDC",
    name: "Benfen USDC",
    logoURI:
      "https://obstatic.243096.com/download/token/images/BenfenTEST/BFC000000000000000000000000000000000000000000000000000000000000000268e4::bf_usdc::BF_USDC.png",
  },
};
export class BfcTransactionImpl {
  private client: BenfenClient;
  private keypair: Ed25519Keypair;

  constructor(privateKey?: string) {
    this.client = new BenfenClient({
      url: getFullnodeUrl("mainnet"),
    });

    if (privateKey) {
      try {
        if (privateKey.startsWith("benfenprivkey")) {
          // 测试网格式私钥
          const decoded = decodeBenfenPrivateKey(privateKey);
          this.keypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
        } else {
          // 主网格式私钥 (hex格式)
          // 将64字节的hex字符串转换为32字节的 Uint8Array
          const privateKeyBytes = Buffer.from(privateKey, "hex");
          if (privateKeyBytes.length !== 64) {
            throw new Error(
              `Invalid private key length: ${privateKeyBytes.length}`
            );
          }
          // 只取前32字节作为私钥
          const secretKey = privateKeyBytes.slice(0, 32);
          this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
        }
      } catch (error) {
        throw new Error(`Invalid private key format: ${error.message}`);
      }
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
        // coinType: TOKEN_INFO.BUSD.address,
        coinType: TOKEN_INFO.BFC.address,
      });
      logger.debug("Gas coins:", gasCoins);
      // logger.debug(
      //   "Gas coins hex:",
      //   Buffer.from(JSON.stringify(gasCoins)).toString("hex")
      // );

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

      const serializeTxn = messageWithIntent(
        IntentScope.TransactionData,
        txBytes
      );

      logger.debug("serializeTxn:", serializeTxn);
      logger.debug(
        "serializeTxn hex:",
        Buffer.from(serializeTxn).toString("hex") +
          Buffer.from(TOKEN_INFO.BFC.address).toString("hex")
      );

      const unsignedTxHex = Buffer.from(txBytes).toString("hex");
      logger.debug("unsignedTxHex bytes hex:", unsignedTxHex);

      // 使用 keypair 签名替代硬件签名
      const { signature, bytes } = await this.keypair.signTransactionBlock(
        txBytes
      );
      logger.debug("Transaction signature:", signature);
      const response = await this.client.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: signature,
      });

      return {
        rawTx: unsignedTxHex,
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

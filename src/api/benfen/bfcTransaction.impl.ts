import { getFullnodeUrl, BenfenClient } from "@benfen/bfc.js/client";
import {
  TransactionBlock,
  TransactionObjectArgument,
} from "@benfen/bfc.js/transactions";
import { Ed25519Keypair } from "@benfen/bfc.js/keypairs/ed25519";
import { logger } from "../../utils/logger";
import { CommonParams } from "../../types/params";
import { BfcSignedTx, BfcTransactionParams } from "./bfcTransaction";
import { BigNumber } from "bignumber.js";
import {
  bfc2HexAddress,
  normalizeHexAddress,
  normalizeStructTag,
  parseStructTag,
} from "@benfen/bfc.js/utils";
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
  },
  BUSD: {
    address:
      "BFC00000000000000000000000000000000000000000000000000000000000000c8e30a::busd::BUSD",
    decimals: 9,
    symbol: "BUSD",
    name: "Benfen USD",
  },
  BJPY: {
    address:
      "BFC00000000000000000000000000000000000000000000000000000000000000c8e30a::bjpy::BJPY",
    decimals: 9,
    symbol: "BJPY",
    name: "Benfen JPY",
  },
  LONG: {
    address:
      "BFC702c0d96768cf59d25c9dbae218b0678fe1ee599af7a2437f7770ded752d9a1a3909::long::LONG",
    decimals: 9,
    symbol: "LONG",
    name: "Benfen LONG",
  },
  USDC: {
    address:
      "BFCd9072e36ecba63b60d724978296677601b1671c60693af34f77a86ef94d67d1e8210::bf_usdc::BF_USDC",
    decimals: 9,
    symbol: "BFC-USDC",
    name: "Benfen USDC",
  },
};
export function normalizeBenfenCoinType(coinType: string): string {
  if (coinType !== "0x2::bfc::BFC") {
    const [normalAddress, module, name] = coinType.split("::");
    if (module && name) {
      try {
        return `${normalizeHexAddress(
          normalAddress
        ).toLowerCase()}::${module}::${name}`;
      } catch {
        // pass
      }
    }
  }
  return coinType;
}
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

  async sendTransaction(params: CommonParams & BfcTransactionParams): Promise<BfcSignedTx> {
    try {
      logger.debug("Starting transaction process with params:", params);
      this.validateParams(params);

      const { payload } = params;
      const tx = new TransactionBlock();
      tx.setSender(payload.from);

      const token = TOKEN_INFO.BUSD;

      // Get all coins
      const allCoins = await this.client.getCoins({
        owner: payload.from,
        coinType: token.address,
      });
      const coins = allCoins.data;

      if (coins.length === 0) {
        throw new Error(`No ${token.symbol} coins available`);
      }

      // Calculate amount with decimals
      const amountInSmallestUnit = new BigNumber(payload.value)
        .multipliedBy(new BigNumber(10).pow(token.decimals))
        .integerValue(BigNumber.ROUND_DOWN)
        .toString();
      const bigintAmount = BigInt(amountInSmallestUnit);

      // Validate total balance
      const totalBalance = coins.reduce(
        (sum, coin) => sum + BigInt(coin.balance),
        0n
      );
      if (totalBalance < bigintAmount) {
        throw new Error(`Insufficient ${token.symbol} balance`);
      }

      // 对于 BFC 转账，使用 gas coin 直接进行转账
      if (token.symbol === "BFC") {
        // Set gas payment using the first coin
        const gasCoin = coins[0];
        tx.setGasPayment([{
          objectId: gasCoin.coinObjectId,
          digest: gasCoin.digest,
          version: gasCoin.version,
        }]);

        // Split from gas coin and transfer
        const [transferCoin] = tx.splitCoins(tx.gas, [tx.pure(bigintAmount)]);
        tx.transferObjects([transferCoin], tx.pure(payload.to));
      } else {
        // 非 BFC 代币的原有逻辑
        tx.setGasPayment([{
          objectId: coins[coins.length - 1].coinObjectId,
          digest: coins[coins.length - 1].digest,
          version: coins[coins.length - 1].version,
        }]);

        const transferCoins = coins.slice(0, -1);
        let currentBalance = 0n;
        const coinsToUse = [];

        for (const coin of transferCoins) {
          if (currentBalance >= bigintAmount) break;
          coinsToUse.push(coin);
          currentBalance += BigInt(coin.balance);
        }

        const coinObjects = coinsToUse.map(coin => tx.object(coin.coinObjectId));
        const primaryCoin = coinObjects.length === 1 
          ? coinObjects[0] 
          : tx.mergeCoins(coinObjects[0], coinObjects.slice(1));

        const [transferCoin] = tx.splitCoins(primaryCoin, [tx.pure(bigintAmount)]);
        tx.transferObjects([transferCoin], tx.pure(payload.to));
      }

      // Build and sign transaction
      const txBytes = await tx.build({
        client: this.client,
        onlyTransactionKind: false,
      });
      const serializeTxn = messageWithIntent(IntentScope.TransactionData, txBytes);
      logger.debug("Serialize transaction:", serializeTxn);
      const unsignedTxHex = Buffer.from(txBytes).toString("hex");

      const { signature } = await this.keypair.signTransactionBlock(txBytes);
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

  // 添加一个新的方法用于分割 coin
  async splitTokenCoin(
    address: string,
    amounts: bigint[],
    tokenSymbol: "BUSD" | "BFC" = "BUSD"
  ): Promise<void> {
    try {
      const tx = new TransactionBlock();
      tx.setSender(address);

      const token = TOKEN_INFO[tokenSymbol];
      logger.debug("Token info:", token);

      // 获取所有 coins
      const getAllCoinsByCoinType = async (coinType: string) => {
        const allCoins = await this.client.getCoins({
          owner: address,
          coinType,
        });
        return allCoins.data;
      };

      // 获取 BFC coins 用于 gas
      const bfcCoins = await getAllCoinsByCoinType("0x2::bfc::BFC");
      if (bfcCoins.length === 0) {
        throw new Error("No BFC coins available for gas");
      }

      // 获取要分割的代币
      const tokenCoins = await getAllCoinsByCoinType(token.address);
      if (tokenCoins.length === 0) {
        throw new Error(`No ${tokenSymbol} coins available`);
      }

      // 计算总分割金额
      const totalSplitAmount = amounts.reduce(
        (sum, amount) => sum + amount,
        0n
      );
      logger.debug("Total split amount:", totalSplitAmount.toString());

      // 使用第一个 BFC coin 作为 gas payment
      tx.setGasPayment([
        {
          objectId: bfcCoins[0].coinObjectId,
          digest: bfcCoins[0].digest,
          version: bfcCoins[0].version,
        },
      ]);

      // 使用第一个代币 coin 作为分割源
      const primaryCoin = tokenCoins[0];

      // 检查余额是否足够
      if (BigInt(primaryCoin.balance) < totalSplitAmount) {
        throw new Error(`Insufficient ${tokenSymbol} balance for split`);
      }

      logger.debug("Splitting coin into multiple coins...");
      logger.debug("Amounts:", amounts);

      // 创建 coin 对象引用
      const primaryCoinInput = tx.object(primaryCoin.coinObjectId);

      // 逐个分割 coin
      for (const amount of amounts) {
        const [splitCoin] = tx.splitCoins(primaryCoinInput, [tx.pure(amount)]);
        tx.transferObjects([splitCoin], tx.pure(address));
      }

      logger.debug("Building transaction...");
      const txBytes = await tx.build({
        client: this.client,
        onlyTransactionKind: false,
      });
      logger.debug("Transaction built successfully");

      const { signature } = await this.keypair.signTransactionBlock(txBytes);
      logger.debug("Transaction signed successfully");

      const response = await this.client.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: signature,
      });

      logger.debug("Split transaction completed:", response.digest);
    } catch (error: any) {
      logger.error("Split operation failed:", error);
      throw new Error(`Split operation failed: ${error.message}`);
    }
  }

  // 使用示例：
  // const bfcTransaction = new BfcTransactionImpl(privateKey);
  // await bfcTransaction.splitBfcCoin(address, [
  //   10000000n,  // 0.01 BFC
  //   20000000n,  // 0.02 BFC
  //   30000000n   // 0.03 BFC
  // ]);
}

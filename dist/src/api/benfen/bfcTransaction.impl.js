import { getFullnodeUrl, BenfenClient } from "@benfen/bfc.js/client";
import { TransactionBlock, } from "@benfen/bfc.js/transactions";
import { Ed25519Keypair } from "@benfen/bfc.js/keypairs/ed25519";
import { logger } from "../../utils/logger";
import { BigNumber } from "bignumber.js";
import { normalizeHexAddress, } from "@benfen/bfc.js/utils";
import { decodeBenfenPrivateKey, IntentScope, messageWithIntent, } from "@benfen/bfc.js/cryptography";
export const TOKEN_INFO = {
    BFC: {
        address: "0x2::bfc::BFC",
        decimals: 9,
        symbol: "BFC",
        name: "BFC",
    },
    BUSD: {
        address: "BFC00000000000000000000000000000000000000000000000000000000000000c8e30a::busd::BUSD",
        decimals: 9,
        symbol: "BUSD",
        name: "Benfen USD",
    },
    BJPY: {
        address: "BFC00000000000000000000000000000000000000000000000000000000000000c8e30a::bjpy::BJPY",
        decimals: 9,
        symbol: "BJPY",
        name: "Benfen JPY",
    },
    LONG: {
        address: "BFC702c0d96768cf59d25c9dbae218b0678fe1ee599af7a2437f7770ded752d9a1a3909::long::LONG",
        decimals: 9,
        symbol: "LONG",
        name: "Benfen LONG",
    },
    USDC: {
        address: "BFCd9072e36ecba63b60d724978296677601b1671c60693af34f77a86ef94d67d1e8210::bf_usdc::BF_USDC",
        decimals: 9,
        symbol: "BFC-USDC",
        name: "Benfen USDC",
    },
};
export function normalizeBenfenCoinType(coinType) {
    if (coinType !== "0x2::bfc::BFC") {
        const [normalAddress, module, name] = coinType.split("::");
        if (module && name) {
            try {
                return `${normalizeHexAddress(normalAddress).toLowerCase()}::${module}::${name}`;
            }
            catch {
                // pass
            }
        }
    }
    return coinType;
}
export class BfcTransactionImpl {
    constructor(privateKey) {
        this.client = new BenfenClient({
            url: getFullnodeUrl("mainnet"),
        });
        if (privateKey) {
            try {
                if (privateKey.startsWith("benfenprivkey")) {
                    // 测试网格式私钥
                    const decoded = decodeBenfenPrivateKey(privateKey);
                    this.keypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
                }
                else {
                    // 主网格式私钥 (hex格式)
                    // 将64字节的hex字符串转换为32字节的 Uint8Array
                    const privateKeyBytes = Buffer.from(privateKey, "hex");
                    if (privateKeyBytes.length !== 64) {
                        throw new Error(`Invalid private key length: ${privateKeyBytes.length}`);
                    }
                    // 只取前32字节作为私钥
                    const secretKey = privateKeyBytes.slice(0, 32);
                    this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
                }
            }
            catch (error) {
                throw new Error(`Invalid private key format: ${error.message}`);
            }
        }
        else {
            // 测试用私钥
            this.keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(1));
        }
    }
    async sendTransaction(params) {
        try {
            logger.debug("Starting transaction process with params:", params);
            this.validateParams(params);
            const { payload } = params;
            const tx = new TransactionBlock();
            tx.setSender(payload.from);
            const token = TOKEN_INFO.BFC;
            logger.debug("Token info:", token);
            // 获取所有 coins
            const getAllCoinsByCoinType = async (coinType) => {
                const allCoins = await this.client.getCoins({
                    owner: payload.from,
                    coinType,
                });
                return allCoins.data;
            };
            // 计算转账金额（考虑 decimals）
            const multiplyByDecimal = (amount, decimal) => {
                return new BigNumber(amount)
                    .multipliedBy(new BigNumber(10).pow(decimal))
                    .integerValue(BigNumber.ROUND_DOWN)
                    .toString();
            };
            // 将金额转换为整数（考虑精度）
            const amountInSmallestUnit = multiplyByDecimal(payload.value, token.decimals);
            const bigintAmount = BigInt(amountInSmallestUnit);
            logger.debug("Transfer amount in smallest unit:", bigintAmount.toString());
            // 获取 BFC coins 用于 gas
            const bfcCoins = await getAllCoinsByCoinType("0x2::bfc::BFC");
            if (bfcCoins.length === 0) {
                throw new Error("No BFC coins available");
            }
            // 设置 gas payment
            const gasCoin = bfcCoins[0];
            tx.setGasPayment([
                {
                    objectId: gasCoin.coinObjectId,
                    digest: gasCoin.digest,
                    version: gasCoin.version,
                },
            ]);
            // 获取要转账的代币
            const tokenCoins = await getAllCoinsByCoinType(token.address);
            if (tokenCoins.length === 0) {
                throw new Error(`No ${token.symbol} coins available`);
            }
            // 计算总余额
            const totalBalance = tokenCoins.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
            if (totalBalance < bigintAmount) {
                throw new Error(`Insufficient ${token.symbol} balance`);
            }
            // 检查是否需要合并 coins
            if (BigInt(tokenCoins[0].balance) < bigintAmount) {
                logger.debug("Need to merge coins for sufficient balance");
                // 找到需要合并的 coins
                let currentBalance = 0n;
                const coinsToMerge = [];
                for (const coin of tokenCoins) {
                    currentBalance += BigInt(coin.balance);
                    coinsToMerge.push(coin);
                    if (currentBalance >= bigintAmount) {
                        break;
                    }
                }
                logger.debug("Coins to merge:", coinsToMerge);
                // 使用第一个 coin 作为主 coin
                const primaryCoin = coinsToMerge[0];
                const primaryCoinInput = tx.object(primaryCoin.coinObjectId);
                // 合并其他 coins 到主 coin
                if (coinsToMerge.length > 1) {
                    const mergeCoins = coinsToMerge
                        .slice(1)
                        .map((coin) => tx.object(coin.coinObjectId));
                    logger.debug("Merging coins:", coinsToMerge.map((c) => c.coinObjectId));
                    tx.mergeCoins(primaryCoinInput, mergeCoins);
                }
                // 分割并转账
                const [transferCoin] = tx.splitCoins(primaryCoinInput, [
                    tx.pure(bigintAmount),
                ]);
                tx.transferObjects([transferCoin], tx.pure(payload.to));
            }
            else {
                // 单个 coin 余额足够，直接使用
                logger.debug("Using single coin for transfer");
                const primaryCoin = tokenCoins[0];
                const primaryCoinInput = tx.object(primaryCoin.coinObjectId);
                const [transferCoin] = tx.splitCoins(primaryCoinInput, [
                    tx.pure(bigintAmount),
                ]);
                tx.transferObjects([transferCoin], tx.pure(payload.to));
            }
            logger.debug("Building transaction...");
            const txBytes = await tx.build({
                client: this.client,
                onlyTransactionKind: false,
            });
            logger.debug("Transaction built successfully");
            const serializeTxn = messageWithIntent(IntentScope.TransactionData, txBytes);
            // const tokenCoins = await getAllCoinsByCoinType(token.address);
            logger.debug("Token coins:", tokenCoins);
            logger.debug("serializeTxn hex with coinType:", Buffer.from(serializeTxn).toString("hex") +
                Buffer.from(tokenCoins[0].coinType).toString("hex"));
            const unsignedTxHex = Buffer.from(txBytes).toString("hex");
            logger.debug("unsignedTxHex bytes hex:", unsignedTxHex);
            const { signature, bytes } = await this.keypair.signTransactionBlock(txBytes);
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
        }
        catch (error) {
            logger.error("Transaction failed:", error);
            throw new Error(`Transaction failed: ${error.message}`);
        }
    }
    validateParams(params) {
        const { payload } = params;
        if (!payload.from || !payload.to || !payload.value) {
            throw new Error("Missing required transaction parameters");
        }
    }
    // 添加一个新的方法用于分割 coin
    async splitTokenCoin(address, amounts, tokenSymbol = "BUSD") {
        try {
            const tx = new TransactionBlock();
            tx.setSender(address);
            const token = TOKEN_INFO[tokenSymbol];
            logger.debug("Token info:", token);
            // 获取所有 coins
            const getAllCoinsByCoinType = async (coinType) => {
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
            const totalSplitAmount = amounts.reduce((sum, amount) => sum + amount, 0n);
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
        }
        catch (error) {
            logger.error("Split operation failed:", error);
            throw new Error(`Split operation failed: ${error.message}`);
        }
    }
}

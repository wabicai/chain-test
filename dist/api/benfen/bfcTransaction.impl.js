"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BfcTransactionImpl = exports.normalizeBenfenCoinType = exports.TOKEN_INFO = void 0;
const client_1 = require("@benfen/bfc.js/client");
const transactions_1 = require("@benfen/bfc.js/transactions");
const ed25519_1 = require("@benfen/bfc.js/keypairs/ed25519");
const logger_1 = require("../../utils/logger");
const bignumber_js_1 = require("bignumber.js");
const utils_1 = require("@benfen/bfc.js/utils");
const cryptography_1 = require("@benfen/bfc.js/cryptography");
exports.TOKEN_INFO = {
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
function normalizeBenfenCoinType(coinType) {
    if (coinType !== "0x2::bfc::BFC") {
        const [normalAddress, module, name] = coinType.split("::");
        if (module && name) {
            try {
                return `${(0, utils_1.normalizeHexAddress)(normalAddress).toLowerCase()}::${module}::${name}`;
            }
            catch {
                // pass
            }
        }
    }
    return coinType;
}
exports.normalizeBenfenCoinType = normalizeBenfenCoinType;
class BfcTransactionImpl {
    constructor(privateKey) {
        this.client = new client_1.BenfenClient({
            url: (0, client_1.getFullnodeUrl)("mainnet"),
        });
        if (privateKey) {
            try {
                if (privateKey.startsWith("benfenprivkey")) {
                    // 测试网格式私钥
                    const decoded = (0, cryptography_1.decodeBenfenPrivateKey)(privateKey);
                    this.keypair = ed25519_1.Ed25519Keypair.fromSecretKey(decoded.secretKey);
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
                    this.keypair = ed25519_1.Ed25519Keypair.fromSecretKey(secretKey);
                }
            }
            catch (error) {
                throw new Error(`Invalid private key format: ${error.message}`);
            }
        }
        else {
            // 测试用私钥
            this.keypair = ed25519_1.Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(1));
        }
    }
    async sendTransaction(params) {
        try {
            logger_1.logger.debug("Starting transaction process with params:", params);
            this.validateParams(params);
            const { payload } = params;
            const tx = new transactions_1.TransactionBlock();
            tx.setSender(payload.from);
            const token = exports.TOKEN_INFO.BUSD;
            // 获取 BUSD coins
            const allCoins = await this.client.getCoins({
                owner: payload.from,
                coinType: token.address,
            });
            const coins = allCoins.data;
            if (coins.length === 0) {
                throw new Error(`No ${token.symbol} coins available`);
            }
            // Calculate amount with decimals
            const amountInSmallestUnit = new bignumber_js_1.BigNumber(payload.value)
                .multipliedBy(new bignumber_js_1.BigNumber(10).pow(token.decimals))
                .integerValue(bignumber_js_1.BigNumber.ROUND_DOWN)
                .toString();
            const bigintAmount = BigInt(amountInSmallestUnit);
            // // Validate total balance
            const totalBalance = coins.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
            if (totalBalance < bigintAmount) {
                throw new Error(`Insufficient ${token.symbol} balance`);
            }
            // 合并所有 BUSD coins（如果需要）
            // let primaryCoin;
            // if (coins.length > 1) {
            //   // 如果有多个 coin，先合并
            //   const mergeCoins = coins
            //     .slice(1)
            //     .map((coin) => tx.object(coin.coinObjectId));
            //   primaryCoin = tx.object(coins[0].coinObjectId);
            //   tx.mergeCoins(primaryCoin, mergeCoins);
            // } else {
            //   primaryCoin = tx.object(coins[0].coinObjectId);
            // }
            if (token.symbol === "BFC") {
                // 获取所有可用的 BFC coins
                const gasCoins = await this.client.getCoins({
                    owner: payload.from,
                    coinType: exports.TOKEN_INFO.BFC.address,
                });
                tx.setGasPayment(gasCoins.data.map((coin) => ({
                    objectId: coin.coinObjectId,
                    version: coin.version,
                    digest: coin.digest,
                })));
                const amountInMist = BigInt(parseFloat(payload.value.toString()) * 1e9);
                const [primaryCoin] = tx.splitCoins(tx.gas, [
                    tx.pure(amountInMist.toString()),
                ]);
                tx.transferObjects([primaryCoin], tx.pure(payload.to));
            }
            else {
                // 非 BFC 代币的逻辑      // 先获取 BFC coins 用于 gas payment
                const BFCCoins = await this.client.getCoins({
                    owner: payload.from,
                    coinType: exports.TOKEN_INFO.BFC.address,
                });
                if (BFCCoins.data.length === 0) {
                    throw new Error("No BFC coins available for gas payment");
                }
                // 设置 gas payment
                tx.setGasPayment([
                    {
                        objectId: BFCCoins.data[0].coinObjectId,
                        version: BFCCoins.data[0].version,
                        digest: BFCCoins.data[0].digest,
                    },
                ]);
                // 分割并转账
                const [transferCoin] = tx.splitCoins(coins[0].coinObjectId, [
                    tx.pure(bigintAmount),
                ]);
                tx.transferObjects([transferCoin], tx.pure(payload.to));
            }
            // Build and sign transaction
            const txBytes = await tx.build({
                client: this.client,
                onlyTransactionKind: false,
            });
            const serializeTxn = (0, cryptography_1.messageWithIntent)(cryptography_1.IntentScope.TransactionData, txBytes);
            const primaryCoinType = coins[0].coinType;
            const primaryCoinTypeLength = primaryCoinType.length;
            logger_1.logger.debug("Primary coin type length:", primaryCoinTypeLength);
            logger_1.logger.debug("Primary coin type:", primaryCoinType);
            logger_1.logger.debug("Serialize transaction:", primaryCoinTypeLength.toString(16).padStart(2, "0") +
                Buffer.from(primaryCoinType).toString("hex") +
                Buffer.from(serializeTxn).toString("hex"));
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
        }
        catch (error) {
            logger_1.logger.error("Transaction failed:", error);
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
            const tx = new transactions_1.TransactionBlock();
            tx.setSender(address);
            const token = exports.TOKEN_INFO[tokenSymbol];
            logger_1.logger.debug("Token info:", token);
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
            logger_1.logger.debug("Total split amount:", totalSplitAmount.toString());
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
            logger_1.logger.debug("Splitting coin into multiple coins...");
            logger_1.logger.debug("Amounts:", amounts);
            // 创建 coin 对象引用
            const primaryCoinInput = tx.object(primaryCoin.coinObjectId);
            // 逐个分割 coin
            for (const amount of amounts) {
                const [splitCoin] = tx.splitCoins(primaryCoinInput, [tx.pure(amount)]);
                tx.transferObjects([splitCoin], tx.pure(address));
            }
            logger_1.logger.debug("Building transaction...");
            const txBytes = await tx.build({
                client: this.client,
                onlyTransactionKind: false,
            });
            logger_1.logger.debug("Transaction built successfully");
            const { signature } = await this.keypair.signTransactionBlock(txBytes);
            logger_1.logger.debug("Transaction signed successfully");
            const response = await this.client.executeTransactionBlock({
                transactionBlock: txBytes,
                signature: signature,
            });
            logger_1.logger.debug("Split transaction completed:", response.digest);
        }
        catch (error) {
            logger_1.logger.error("Split operation failed:", error);
            throw new Error(`Split operation failed: ${error.message}`);
        }
    }
}
exports.BfcTransactionImpl = BfcTransactionImpl;

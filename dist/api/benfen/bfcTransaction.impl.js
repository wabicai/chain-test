"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BfcTransactionImpl = exports.TOKEN_INFO = void 0;
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
        logoURI: "https://obstatic.243096.com/mili/images/currency/chain/Benfen2.png",
    },
    BUSD: {
        address: "BFC00000000000000000000000000000000000000000000000000000000000000c8e30a::busd::BUSD",
        decimals: 9,
        symbol: "BUSD",
        name: "Benfen USD",
        logoURI: "https://obstatic.243096.com/download/token/images/BenfenTEST/BFC00000000000000000000000000000000000000000000000000000000000000c8e30a::busd::BUSD.png",
    },
    "BFC-USDT": {
        address: "BFC000000000000000000000000000000000000000000000000000000000000000268e4::bf_usdt::BF_USDT",
        decimals: 9,
        symbol: "BFC-USDT",
        name: "Benfen USDT",
        logoURI: "https://obstatic.243096.com/download/token/images/BenfenTEST/BFC000000000000000000000000000000000000000000000000000000000000000268e4::bf_usdt::BF_USDT.png",
    },
    "BFC-USDC": {
        address: "BFC000000000000000000000000000000000000000000000000000000000000000268e4::bf_usdc::BF_USDC",
        decimals: 9,
        symbol: "BFC-USDC",
        name: "Benfen USDC",
        logoURI: "https://obstatic.243096.com/download/token/images/BenfenTEST/BFC000000000000000000000000000000000000000000000000000000000000000268e4::bf_usdc::BF_USDC.png",
    },
};
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
            const normalizeStructTagForRpc = (address) => {
                const tag = (0, utils_1.parseStructTag)(address);
                tag.address = (0, utils_1.bfc2HexAddress)(tag.address);
                return (0, utils_1.normalizeStructTag)(tag);
            };
            // 获取 BFC coins 用于支付 gas
            const bfcCoins = await this.client.getCoins({
                owner: payload.from,
                coinType: "0x2::bfc::BFC", // 使用主币 BFC
            });
            // 获取 BUSD coins 用于转账
            const busdCoins = await this.client.getCoins({
                owner: payload.from,
                coinType: normalizeStructTagForRpc(exports.TOKEN_INFO.BUSD.address),
            });
            // 设置 gas coin
            if (bfcCoins.data.length > 0) {
                tx.setGasPayment([
                    {
                        objectId: bfcCoins.data[0].coinObjectId,
                        version: bfcCoins.data[0].version,
                        digest: bfcCoins.data[0].digest,
                    },
                ]);
            }
            else {
                throw new Error("No BFC available for gas payment");
            }
            // 计算需要转账的 BUSD 金额
            const token = exports.TOKEN_INFO.BUSD;
            const multiplyByDecimal = (amount, decimal) => {
                return new bignumber_js_1.BigNumber(amount).shiftedBy(decimal).toString();
            };
            const bigintAmount = BigInt(multiplyByDecimal(payload.value, token.decimals));
            // 计算所有 BUSD coins 的总余额
            const totalBalance = busdCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
            if (totalBalance < bigintAmount) {
                throw new Error("Insufficient BUSD balance");
            }
            tx.setSender(payload.from);
            // 处理 BUSD 转账
            let sourceCoin;
            // if (BigInt(busdCoins.data[0].balance) < bigintAmount) {
            logger_1.logger.debug("busdCoins data", busdCoins.data);
            sourceCoin = busdCoins.data[0].coinObjectId;
            for (let i = 1; i < busdCoins.data.length; i++) {
                tx.mergeCoins(sourceCoin, [busdCoins.data[i].coinObjectId]);
                if (BigInt(busdCoins.data[0].balance) +
                    BigInt(busdCoins.data[i].balance) >=
                    bigintAmount) {
                    break;
                }
            }
            // } else {
            //   sourceCoin = busdCoins.data[0].coinObjectId;
            // }
            // 分割并转账 BUSD
            const [transferCoin] = tx.splitCoins(sourceCoin, [tx.pure(bigintAmount)]);
            tx.transferObjects([transferCoin], tx.pure(payload.to));
            const txBytes = await tx.build({
                client: this.client,
                onlyTransactionKind: false,
            });
            const serializeTxn = (0, cryptography_1.messageWithIntent)(cryptography_1.IntentScope.TransactionData, txBytes);
            logger_1.logger.debug("serializeTxn:", serializeTxn);
            logger_1.logger.debug("serializeTxn hex:", Buffer.from(serializeTxn).toString("hex"));
            const unsignedTxHex = Buffer.from(txBytes).toString("hex");
            logger_1.logger.debug("unsignedTxHex bytes hex:", unsignedTxHex);
            // 使用 keypair 签名替代硬件签名
            const { signature, bytes } = await this.keypair.signTransactionBlock(txBytes);
            logger_1.logger.debug("Transaction signature:", signature);
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
}
exports.BfcTransactionImpl = BfcTransactionImpl;

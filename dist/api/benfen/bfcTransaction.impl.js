"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BfcTransactionImpl = void 0;
const client_1 = require("@benfen/bfc.js/client");
const transactions_1 = require("@benfen/bfc.js/transactions");
const ed25519_1 = require("@benfen/bfc.js/keypairs/ed25519");
const logger_1 = require("../../utils/logger");
const cryptography_1 = require("@benfen/bfc.js/cryptography");
class BfcTransactionImpl {
    constructor(privateKey) {
        this.client = new client_1.BenfenClient({
            url: (0, client_1.getFullnodeUrl)("testnet"),
        });
        if (privateKey) {
            // 使用传入的私钥
            const decoded = (0, cryptography_1.decodeBenfenPrivateKey)(privateKey);
            this.keypair = ed25519_1.Ed25519Keypair.fromSecretKey(decoded.secretKey);
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
            const gasCoins = await this.client.getCoins({
                owner: payload.from,
                coinType: "0x2::bfc::BFC",
            });
            if (!gasCoins.data || gasCoins.data.length === 0) {
                throw new Error("No gas coins found for the account");
            }
            tx.setGasPayment(gasCoins.data.map((coin) => ({
                objectId: coin.coinObjectId,
                version: coin.version,
                digest: coin.digest,
            })));
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
            logger_1.logger.debug("Transaction bytes:", txBytes);
            // 使用 keypair 签名替代硬件签名
            const { signature } = await this.keypair.signTransactionBlock(txBytes);
            logger_1.logger.debug("Transaction signature:", signature);
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

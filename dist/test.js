"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const blake2b_1 = require("@noble/hashes/blake2b");
const ed25519_1 = require("@benfen/bfc.js/keypairs/ed25519");
const client_1 = require("@benfen/bfc.js/client");
const cryptography_1 = require("@benfen/bfc.js/cryptography");
const faucet_1 = require("@benfen/bfc.js/faucet");
const transactions_1 = require("@benfen/bfc.js/transactions");
const utils_1 = require("@benfen/bfc.js/utils");
const exampleMnemonic = "regret curious ridge evil unaware tuition task length unique advance cupboard retire";
const keypair = ed25519_1.Ed25519Keypair.deriveKeypair(exampleMnemonic, `m/44'/728'/0'/0'/0'`);
const address = keypair.getPublicKey().toHexAddress();
const bfcAddress = (0, utils_1.hex2BfcAddress)(address);
console.log("hex address: ", address);
console.log("benfen address: ", bfcAddress);
const benfenClient = new client_1.BenfenClient({ url: (0, client_1.getFullnodeUrl)("mainnet") });
const MY_ADDRESS = "BFCb4ced58018b75d7ba72a10fa97c09b7bf66533ff104bf9db1bfdb004b17d8eaa2e35";
const Account_2_ADDRESS = "BFCed0028abcede548b9080f42656132c5fbffbd859e08946ce361638c3396cdb2617a3";
// const USDC_COIN_TYPE = '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC'
// 领水
async function getTestCoinFromFaucet(address) {
    (0, faucet_1.requestBfcFromFaucetV1)({
        host: (0, faucet_1.getFaucetHost)("testnet"),
        recipient: address,
    });
}
// getTestCoinFromFaucet(MY_ADDRESS)
// 查询余额
async function getNativeBalance(address) {
    const balance = await benfenClient.getBalance({
        owner: address,
    });
    // const balance = await benfenClient.getCoins({
    //   owner: address,
    // });
    console.log("Benfen Native Balance: ", balance);
}
async function getCoins(address) {
    const allCoins = await benfenClient.getAllCoins({
        owner: address,
    });
    console.log("Benfen Coins: ", allCoins);
    return allCoins;
}
async function mergeCoinsUntilAmount(tx, coins, amount) {
    if (coins.length === 0) {
        throw new Error("没有可用的币");
    }
    let mergedCoin = coins[0].coinObjectId;
    let currentBalance = BigInt(coins[0].balance);
    for (let i = 1; i < coins.length && currentBalance < BigInt(amount); i++) {
        tx.mergeCoins(mergedCoin, [coins[i].coinObjectId]);
        currentBalance += BigInt(coins[i].balance);
        // 如果达到或超过所需金额,立即停止合并
        if (currentBalance >= BigInt(amount)) {
            break;
        }
    }
    if (currentBalance < BigInt(amount)) {
        throw new Error("余额不足");
    }
    return mergedCoin;
}
async function sendTokenTransaction(sender, recipient, amount, coinType) {
    const tx = new transactions_1.TransactionBlock();
    // 获取所有 coins
    const allCoins = await getCoins(sender);
    // 过滤出指定类型的币
    const filteredCoins = allCoins.data.filter((coin) => coin.coinType === coinType);
    // 计算总余额
    const totalBalance = filteredCoins.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
    if (totalBalance < BigInt(amount)) {
        throw new Error("余额不足");
    }
    let sourceCoin;
    if (filteredCoins[0].balance < amount) {
        // 如果单个 coin 不足以支付,进行合并
        sourceCoin = await mergeCoinsUntilAmount(tx, filteredCoins, amount);
    }
    else {
        // 如果单个 coin 足够,直接使用
        sourceCoin = filteredCoins[0].coinObjectId;
    }
    const [coin] = tx.splitCoins(sourceCoin, [amount]);
    tx.transferObjects([coin], recipient);
    console.log("Transaction: ", tx);
    const txBytes = tx.serialize();
    console.log("txBytes: ", txBytes);
    tx.setSender(sender);
    const txBlock = await tx.build({
        client: benfenClient,
    });
    const dryRunResult = await benfenClient.dryRunTransactionBlock({
        transactionBlock: txBlock,
    });
    console.log("Dry Run Result: ", dryRunResult);
    const intentMessage = (0, cryptography_1.messageWithIntent)(cryptography_1.IntentScope.TransactionData, txBlock);
    console.log("intentMessage: ", Buffer.from(intentMessage).toString("hex"));
    const signature = generateSignature(intentMessage, keypair);
    const b64bytes = (0, utils_1.toB64)(txBlock);
    const result = await benfenClient.executeTransactionBlock({
        transactionBlock: b64bytes,
        signature: signature,
    });
    console.log("signed txBlock: ", b64bytes);
    console.log("signature: ", signature);
    console.log("Result: ", result);
}
function generateSignature(data, keyPair) {
    const digest = (0, blake2b_1.blake2b)(data, { dkLen: 32 });
    const pubkey = keyPair.getPublicKey();
    const signature = keyPair.signData(digest);
    const signatureScheme = keyPair.getKeyScheme();
    return (0, cryptography_1.toSerializedSignature)({
        signature,
        signatureScheme,
        publicKey: pubkey,
    });
}
async function sendNativeTokenTransaction(sender, recipient, amount) {
    await sendTokenTransaction(sender, recipient, amount, utils_1.BFC_TYPE_ARG);
}
// async function sendUSDCTransaction(sender, recipient, amount) {
//   await sendTokenTransaction(sender, recipient, amount, USDC_COIN_TYPE);
// }
getNativeBalance(MY_ADDRESS);
getCoins(MY_ADDRESS);
sendNativeTokenTransaction(MY_ADDRESS, Account_2_ADDRESS, 20000000); // Account1 send 0.01 SUI to Account2
// sendNativeTokenTransaction(Account_2_ADDRESS, MY_ADDRESS, 2001000000, SUI_TYPE_ARG) // Account2 send 0.01 SUI to Account1
// sendUSDCTransaction(Account_2_ADDRESS, MY_ADDRESS, 6000000, USDC_COIN_TYPE) // send 10 USDC

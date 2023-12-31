import {ApiPromise, Keyring, WsProvider} from '@polkadot/api';
import fs from 'fs';
import {Abi, ContractPromise} from '@polkadot/api-contract';
import ABI from './artifacts/ApillonGratitudeNFT.json';
import {sendTransaction} from '@astar-network/astar-sdk-core';
import type {ISubmittableResult} from '@polkadot/types/types';
import parser from 'csv-parser-sync-plus-promise';

const TESTNET_RPC_URL = 'wss://rpc.shibuya.astar.network';
const MAINNET_RPC_URL = 'wss://rpc.astar.network';
const mnemonic = fs.readFileSync('mnemonic.txt').toString().trim();
const mintInfo = parser.readCsvSync('mint-details.csv');

//RUN MINT
let mintsProcessed = 0;
let successfullyMinted = 0;
const failedMintWallets = [];
const commandArguments = process.argv.slice(2);
const contractAddress = commandArguments[0];
const wsUrl = commandArguments[1] == 'mainnet' ? MAINNET_RPC_URL : TESTNET_RPC_URL;

mint(contractAddress, wsUrl, mintInfo).catch(console.error);

async function mint(
    contractAddress: string,
    wsUrl: string,
    mints: { [key: string]: string }[],
) {
    if (!contractAddress) {
        return console.error('\nERROR: Contract address missing.')
    }
    if (!wsUrl) {
        return console.error('\nERROR: RPC websocket URL missing.')
    }
    const mintsTotal = mints.length;
    console.log(`\n\nStarting mint`);
    console.log('-----------------------------------------------')
    console.log(`NFT COUNT: ${mintsTotal}`);
    console.log(`CONTRACT : ${contractAddress}`);
    console.log(`RPC URL  : ${wsUrl}`);
    console.log('-----------------------------------------------')
    console.log(`Press Enter to continue...`);
    await waitForKey(10)

    //START MINT
    const wsProvider = new WsProvider(wsUrl);
    const api = await ApiPromise.create({
        provider: wsProvider,
        noInitWarn: true,
    });
    const abi = new Abi(ABI, api.registry.getChainProperties());
    const contract = new ContractPromise(api, abi, contractAddress);

    const keyring = new Keyring({type: 'sr25519'});
    const deployer = keyring.addFromMnemonic(mnemonic);

    const accountInfo = await api.query.system.account(deployer.address);
    // @ts-ignore
    let nextNonce = accountInfo.nonce.toNumber();
    for (const mint of mints) {
        const receiverAddress = mint.address.trim();
        const tokenId = parseInt(mint.tokenId.trim());
        const tokenUri = mint.tokenUri.trim();
        try {
            if (!receiverAddress || !tokenId || !tokenUri) {
                throw Error(`Some mint data is missing for mint: ${mint}`);
            }
            console.log(
                `Minting token #${tokenId} for ${receiverAddress} with nonce ${nextNonce}...`,
            );
            const tx = await sendTransaction(
                api,
                contract,
                'pinkMint::mint',
                deployer.address,
                0,
                receiverAddress,
                tokenUri,
            );
            await tx.signAndSend(deployer, {nonce: nextNonce}, statusHandler(mint));
            console.log(
                `SUCCESS: Sent mint TX for token #${tokenId} and address ${receiverAddress}`,
            );
            nextNonce += 1;
        } catch (e) {
            console.error(
                'ERROR: Minting failed for token #',
                tokenId,
                'and address',
                receiverAddress,
                '.',
                e,
            );
            failedMintWallets.push(Object.values(mint).join(','));
            mintsProcessed += 1;
        }
    }
    while (mintsProcessed < mintsTotal) {
        console.log(`Waiting for ${mintsTotal - mintsProcessed} transactions...`);
        await delay(2500);
    }
    if (failedMintWallets.length > 0) {
        fs.writeFileSync(`output/failed-mints.csv`, failedMintWallets.join('\n'));
    }
    console.log(
        `Minted ${successfullyMinted} NFTs, ${failedMintWallets.length} transaction failed.`,
    );
    await api.disconnect();
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function statusHandler(mint: { [key: string]: string }) {
    return (result: ISubmittableResult) => {
        if (result.status.isInBlock) {
            for (const e of result.events) {
                const {
                    event: {method, section},
                } = e;
                if (section === 'system' && method === 'ExtrinsicFailed') {
                    failedMintWallets.push(Object.values(mint).join(','));
                    mintsProcessed += 1;
                }
            }
        } else if (
            result.status.isInvalid ||
            result.status.isDropped ||
            result.status.isUsurped ||
            result.status.isRetracted ||
            result.isError
        ) {
            mintsProcessed += 1;
        } else if (result.status.isFinalized) {
            mintsProcessed += 1;
            successfullyMinted += 1;
        }
    };
}

function waitForKey(keyCode: number) {
    return new Promise(resolve => {
        process.stdin.on('data', function (chunk) {
            if (chunk[0] === keyCode) {
                resolve(true);
                process.stdin.pause();
            }
        });
    });
}
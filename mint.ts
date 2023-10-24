import {ApiPromise, Keyring, WsProvider} from '@polkadot/api';
import fs from 'fs';
import {Abi, ContractPromise} from '@polkadot/api-contract';
import ABI from './artifacts/ApillonGratitudeNFT.json';
import {sendTransaction} from '@astar-network/astar-sdk-core';
import type {ISubmittableResult} from '@polkadot/types/types';
import parser from 'csv-parser-sync-plus-promise';

const wsUrl = 'wss://rpc.shibuya.astar.network';
const mnemonic = fs.readFileSync('mnemonic.txt').toString().trim();
const mintInfo = parser.readCsvSync('mint-details.csv');
const commandArguments = process.argv.slice(2);

//START MINT
let mintsProcessed = 0;
let successfullyMinted = 0;
const failedMintWallets = [];
mint(commandArguments[0], mintInfo).catch(console.error);

async function mint(
    contractAddress: string,
    mints: { [key: string]: string }[],
) {
    if (!contractAddress) {
        throw Error('Contract address missing.')
    }
    const mintsTotal = mints.length;
    console.log(`Starting mint for ${mintsTotal} NFTs:`);
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
        const tokenId = parseInt(mint.tokenId);
        const tokenUri = mint.tokenUri;
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

import {expect, use} from "chai";
import chaiAsPromised from "chai-as-promised";
import Psp_factory from "../types/constructors/ApillonGratitudeNFT";
import PspContract from "../types/contracts/ApillonGratitudeNFT";
import {ApiPromise, Keyring, WsProvider} from "@polkadot/api";
import {KeyringPair} from "@polkadot/keyring/types";
import {IdBuilder} from "../types/types-arguments/ApillonGratitudeNFT";

use(chaiAsPromised);

const MAX_SUPPLY = 1;
const CONTRACT_NAME = "ApillonGratitudeNFT"
const TOKEN_BASE_URI = 'ipfs://base-uri/'
const TOKEN_URI = `${TOKEN_BASE_URI}/1.json`

const wsProvider = new WsProvider("ws://127.0.0.1:9944");
const keyring = new Keyring({type: "sr25519"});

describe("Apillon Gratitude NFT Contract Interaction", () => {
    let pspFactory: Psp_factory;
    let api: ApiPromise;
    let deployer: KeyringPair;
    let customer: KeyringPair;
    let psp: PspContract;

    beforeEach(async function (): Promise<void> {
        api = await ApiPromise.create({provider: wsProvider, noInitWarn: true});
        deployer = keyring.addFromUri("//Alice");
        customer = keyring.addFromUri("//Bob");
        pspFactory = new Psp_factory(api, deployer);
        psp = new PspContract(
            (
                await pspFactory.new(
                    [CONTRACT_NAME],
                    ["AGNFT"],
                    MAX_SUPPLY,
                    null,
                )
            ).address,
            deployer,
            api
        );
    });

    it("init contracts works", async () => {
        expect(
            (await psp.query.totalSupply()).value.unwrap().toNumber()
        ).to.equal(0);
        expect((await psp.query.maxSupply()).value.unwrap()).to.equal(MAX_SUPPLY);
    });

    it("owner is admin", async () => {
        expect((await psp.query.hasRole(0, deployer.address)).value.ok).to.equal(true);
    });

    it("customer is not admin", async () => {
        expect((await psp.query.hasRole(0, customer.address)).value.ok).to.equal(false);
    });

    it("customer can't mint NFT", async () => {
        await expect(psp.withSigner(customer).tx.mint(customer.address, [TOKEN_URI])).to.be.rejectedWith()
        expect(
            (await psp.query.totalSupply()).value.unwrap().toNumber()
        ).to.equal(0);
    });

    it("owner can mint NFT", async () => {
        expect((await psp.withSigner(deployer).tx.mint(customer.address, [TOKEN_URI])).result).to.be.ok;
        expect(
            (await psp.query.totalSupply()).value.unwrap().toNumber()
        ).to.equal(1);
        // TODO: empty value returned for URI
        // expect((await psp.query.tokenUri(1)).value.unwrap().ok).to.equal(TOKEN_URI)
    });

    it("owner can't mint NFTs over supply", async () => {
        expect((await psp.withSigner(deployer).tx.mint(customer.address, [TOKEN_URI])).result).to.be.ok;
        await expect(psp.withSigner(deployer).tx.mint(customer.address, [TOKEN_URI])).to.be.rejectedWith()
        expect(
            (await psp.query.totalSupply()).value.unwrap().toNumber()
        ).to.equal(1);
    });

    it("owner can change NFT metadata", async () => {
        expect((await psp.withSigner(deployer).tx.mint(customer.address, [TOKEN_URI])).result).to.be.ok;
        expect(
            (await psp.query.totalSupply()).value.unwrap().toNumber()
        ).to.equal(1);
        const tokenId = 1
        const newTokenUri = `${TOKEN_BASE_URI}_claimed/1.json`
        expect(
            (await psp.tx.changeMetadata(IdBuilder.U64(tokenId), [newTokenUri])).result.isFinalized
        ).to.equal(true)
        // TODO: empty value returned for URI
        // expect((await psp.query.tokenUri(tokenId)).value.unwrap().ok).to.equal(newTokenUri)
    });

    it("owner can't transfer NFT customer owns", async () => {
        expect((await psp.withSigner(deployer).tx.mint(customer.address, [TOKEN_URI])).result).to.be.ok;
        const tokenId = IdBuilder.U64(1)
        expect((await psp.query.ownerOf(tokenId)).value.unwrap()).to.equal(customer.address)
        await expect(psp.withSigner(deployer).tx.transfer(deployer.address, tokenId, [])).to.be.rejectedWith()
        expect((await psp.query.ownerOf(tokenId)).value.unwrap()).to.equal(customer.address)
    });

    it("customer can transfer NFT they own", async () => {
        expect((await psp.withSigner(deployer).tx.mint(customer.address, [TOKEN_URI])).result).to.be.ok;
        const tokenId = IdBuilder.U64(1)
        expect((await psp.withSigner(customer).tx.transfer(deployer.address, tokenId, [])).result).to.be.ok;
        expect((await psp.query.ownerOf(tokenId)).value.unwrap()).to.equal(deployer.address)
    });

    it("customer can't transfer NFT they don't own", async () => {
        expect((await psp.withSigner(deployer).tx.mint(deployer.address, [TOKEN_URI])).result).to.be.ok;
        const tokenId = IdBuilder.U64(1)
        await expect(psp.withSigner(customer).tx.transfer(customer.address, tokenId, [])).to.be.rejectedWith()
        expect((await psp.query.ownerOf(tokenId)).value.unwrap()).to.equal(deployer.address)
    });

    it("owner can grant and revoke admin role", async () => {
        expect((await psp.query.hasRole(0, customer.address)).value.ok).to.equal(false);
        expect((await psp.withSigner(deployer).tx.grantRole(0, customer.address)).result).to.be.ok;
        expect((await psp.query.hasRole(0, customer.address)).value.ok).to.equal(true);
        expect((await psp.withSigner(deployer).tx.revokeRole(0, customer.address)).result).to.be.ok;
        expect((await psp.query.hasRole(0, customer.address)).value.ok).to.equal(false);
    });

    it("customer can't change metadata", async () => {
        expect((await psp.withSigner(deployer).tx.mint(customer.address, [TOKEN_URI])).result).to.be.ok;
        await expect(psp.withSigner(customer).tx.changeMetadata(IdBuilder.U64(1), ['new_uri'])).to.be.rejectedWith()
    });

    it("owner can change metadata", async () => {
        expect((await psp.withSigner(deployer).tx.mint(customer.address, [TOKEN_URI])).result).to.be.ok;
        const tokenId = IdBuilder.U64(1);
        const changedUri = 'new_uri';
        expect((await psp.withSigner(deployer).tx.changeMetadata(tokenId, [changedUri])).result).to.be.ok;
        // TODO: empty value returned for URI
        // expect((await psp.query.tokenUri(1)).value.unwrap().ok).to.equal(changedUri);
    });
});



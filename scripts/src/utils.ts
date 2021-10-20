import { Token } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Signer } from "@solana/web3.js";

import fs from "fs-extra";
import path from "path";
import {
  KEYS_FOLDER,
  SOLANA_CONNECTION,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "./constants";

export const logError = (msg: string) => {
  console.log(`\x1b[31m${msg}\x1b[0m`);
};

export const sleep = (timeInMilliseconds: number) =>
  new Promise((res) => setTimeout(res, timeInMilliseconds));

export const generateKeypair = () => Keypair.generate();

export const getBalance = async (address: PublicKey) =>
  SOLANA_CONNECTION.getBalance(address);

export const getMintPubKey = async (mintName: string) => {
  try {
    const mintTokenFilePath = path.resolve(
      KEYS_FOLDER,
      "mints",
      `${mintName.toLowerCase()}_pub.json`
    );

    const mintTokenAddress = await fs.readJSON(mintTokenFilePath, {
      encoding: "utf8",
    });

    return new PublicKey(mintTokenAddress);
  } catch (err) {
    return null;
  }
};

export const getPublicKey = async (accountNickname: string) => {
  try {
    const filePath = path.resolve(
      KEYS_FOLDER,
      accountNickname,
      "publicKey.json"
    );
    const publicKey = await fs.readJSON(filePath, { encoding: "utf8" });
    return new PublicKey(publicKey);
  } catch (err) {
    console.log(err);
    return null;
  }
};

export const getPrivateKey = async (accountNickname: string) => {
  try {
    const filePath = path.resolve(
      KEYS_FOLDER,
      accountNickname,
      "privateKey.json"
    );
    const privateKey = await fs.readJSON(filePath, { encoding: "utf8" });
    return Uint8Array.from(privateKey);
  } catch (err) {
    console.log(err);
    return null;
  }
};

export const getKeypair = async (accountName: string) => {
  const accPubKey = await getPublicKey(accountName);
  const accPrivKey = await getPrivateKey(accountName);
  if (accPubKey && accPrivKey) {
    return new Keypair({
      publicKey: accPubKey.toBytes(),
      secretKey: accPrivKey,
    });
  }

  return null;
};

export const topupAccount = async (address: PublicKey, amount: number) => {
  const accountBalance = (await getBalance(address)) / LAMPORTS_PER_SOL;
  console.log("BALANCE:", accountBalance);
  if (accountBalance === 0) {
    const transactionSignature = await SOLANA_CONNECTION.requestAirdrop(
      address,
      amount * LAMPORTS_PER_SOL
    );
    return SOLANA_CONNECTION.confirmTransaction(transactionSignature);
  }
  return null;
};

export const createMintAccount = async (
  masterAccount: Signer,
  { name, decimals }: { name: string; decimals: number }
) => {
  console.log(`CREATING ${name} MINT ACCOUNT`);
  const mintTokenFileName = `${name.toLowerCase()}_pub.json`;
  const mintTokenPath = path.resolve(KEYS_FOLDER, "mints", mintTokenFileName);

  if (await fs.pathExists(mintTokenPath)) {
    const mAddress = await fs.readJSON(mintTokenPath, { encoding: "utf8" });
    if (mAddress) {
      const mPubKey = new PublicKey(mAddress);
      console.log("EXISTS: MINT TOKEN ADDRESS", mPubKey.toString());
      return new Token(
        SOLANA_CONNECTION,
        mPubKey,
        TOKEN_PROGRAM_ID,
        masterAccount
      );
    }
  }

  const mintToken = await Token.createMint(
    SOLANA_CONNECTION,
    masterAccount,
    masterAccount.publicKey,
    null,
    decimals,
    TOKEN_PROGRAM_ID
  );

  await fs.mkdirp(path.resolve(KEYS_FOLDER, "mints"));
  await fs.writeJSON(
    path.resolve(KEYS_FOLDER, "mints", mintTokenFileName),
    mintToken.publicKey.toString()
  );
  console.log("NEW: MINT TOKEN ADDRESS", mintToken.publicKey.toString());
  return mintToken;
};

export const createAssociatedTokenAccount = async (
  mintToken: Token,
  owner: PublicKey,
  name: string
) => {
  const associatedTokenAddress =
    await mintToken.getOrCreateAssociatedAccountInfo(owner);
  await writePublicKey(name, associatedTokenAddress.address);
  return associatedTokenAddress.address;
};

export const createTokenAccount = async (
  mint: Token,
  tokenAccountOwner: PublicKey,
  name: string
) => {
  const tokenAccountPath = path.resolve(KEYS_FOLDER, name, "publicKey.json");
  if (await fs.pathExists(tokenAccountPath)) {
    const tAddress = await fs.readJSON(tokenAccountPath, { encoding: "utf8" });
    if (tAddress) {
      const tPubKey = new PublicKey(tAddress);
      console.log("EXISTS: TOKEN ACCOUNT ADDRESS", tPubKey.toString());
      return tPubKey;
    }
  }

  console.log("CREATING TOKEN ACCOUNTS FOR MINT");
  const tokenAccount = await mint.createAccount(tokenAccountOwner);
  console.log("NEW: TOKEN ACCOUNT ADDRESS", tokenAccount.toString());
  await writePublicKey(name, tokenAccount);
  return tokenAccount;
};

export const writePublicKey = async (
  accountNickname: string,
  pubkey: PublicKey
) => {
  try {
    await fs.mkdirp(path.resolve(KEYS_FOLDER, accountNickname));
    await fs.writeJSON(
      path.resolve(KEYS_FOLDER, accountNickname, "publicKey.json"),
      pubkey.toString()
    );

    return true;
  } catch (err) {
    return false;
  }
};

export const writePrivateKey = async (
  accountNickname: string,
  privateKey: Uint8Array
) => {
  try {
    await fs.mkdirp(path.resolve(KEYS_FOLDER, accountNickname));
    await fs.writeJSON(
      path.resolve(KEYS_FOLDER, accountNickname, "publicKey.json"),
      privateKey
    );

    return true;
  } catch (err) {
    return false;
  }
};

export const transferTokens = async (
  accountNickname: string,
  tokenAddress: PublicKey,
  senderAddress: PublicKey,
  receiverAddress: PublicKey,
  mintToken: Token,
  amount: number,
  decimals: number
) => {
  try {
    const receiverAccountInfo = await SOLANA_CONNECTION.getAccountInfo(
      receiverAddress
    );
    const destAddress = receiverAccountInfo?.owner.equals(SYSTEM_PROGRAM_ID)
      ? (await mintToken.getOrCreateAssociatedAccountInfo(receiverAddress))
          .address
      : receiverAddress;

    const secretKey = await getPrivateKey(accountNickname);
    if (!secretKey) throw new Error("Private Key not found");

    const transferSignature = await mintToken.transfer(
      tokenAddress,
      destAddress,
      new Keypair({
        publicKey: senderAddress.toBytes(),
        secretKey,
      }),
      [],
      amount * 10 ** decimals
    );

    await SOLANA_CONNECTION.confirmTransaction(transferSignature);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
};

export const getTokenAccountBalance = async (
  tokenAccount: PublicKey,
  tokenName: string
) => {
  try {
    const {
      value: { uiAmount },
    } = await SOLANA_CONNECTION.getTokenAccountBalance(
      tokenAccount,
      "confirmed"
    );
    return `${uiAmount} ${tokenName}`;
  } catch (err) {
    return null;
  }
};

import path from "path";
import fs from "fs-extra";

import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ESCROW_PROGRAM_ID,
  KEYS_FOLDER,
  LAYOUTS,
  SOLANA_CONNECTION,
  TOKEN_PROGRAM_ID,
} from "./constants";
import { EscrowLayout } from "./types";
import {
  getKeypair,
  getPublicKey,
  getTokenAccountBalance,
  sleep,
} from "./utils";

(async function () {
  if (!fs.pathExists(KEYS_FOLDER)) {
    console.log(
      "Looks like you haven't stored alice, bob and master account's keypairs"
    );

    console.log("Use yarn store to create it :)");
    return;
  }

  let alice = await getKeypair("alice");
  let aliceUSDCAssoTokenAccount = await getPublicKey("aliceUSDCToken");
  let tempUSDCTokenAccount = await getPublicKey("aliceTempToken");
  let escrowStateAccount = await getPublicKey("escrowAccount");

  if (
    alice &&
    aliceUSDCAssoTokenAccount &&
    tempUSDCTokenAccount &&
    escrowStateAccount
  ) {
    const escrowStateAccountInfo = await SOLANA_CONNECTION.getAccountInfo(
      escrowStateAccount
    );

    if (escrowStateAccountInfo) {
      const { data } = escrowStateAccountInfo;
      const { escrowPDABump } = LAYOUTS["escrowAccountLayout"].decode(
        data
      ) as EscrowLayout;

      const escrowPDAAccount = await PublicKey.createProgramAddress(
        [Buffer.from("escrow"), alice.publicKey.toBytes(), escrowPDABump],
        ESCROW_PROGRAM_ID
      );

      const close_escrow_instruction = new TransactionInstruction({
        programId: ESCROW_PROGRAM_ID,
        keys: [
          {
            isSigner: true,
            isWritable: false,
            pubkey: alice.publicKey,
          },
          {
            isSigner: false,
            isWritable: true,
            pubkey: escrowStateAccount,
          },
          {
            isSigner: false,
            isWritable: true,
            pubkey: tempUSDCTokenAccount,
          },
          {
            isSigner: false,
            isWritable: true,
            pubkey: aliceUSDCAssoTokenAccount,
          },
          {
            isSigner: false,
            isWritable: false,
            pubkey: TOKEN_PROGRAM_ID,
          },
          {
            isSigner: false,
            isWritable: false,
            pubkey: escrowPDAAccount,
          },
        ],
        data: Buffer.from(Uint8Array.of(2)),
      });

      console.log(
        "ALICE USDC BALANCE BEFORE CANCELLING",
        await getTokenAccountBalance(aliceUSDCAssoTokenAccount, "USDC")
      );

      await SOLANA_CONNECTION.sendTransaction(
        new Transaction().add(close_escrow_instruction),
        [alice],
        { preflightCommitment: "confirmed", skipPreflight: false }
      );

      console.log("SLEEPING FOR 2 SECONDS");
      await sleep(2000);

      console.log(
        "ALICE USDC BALANCE AFTER CANCELLING",
        await getTokenAccountBalance(aliceUSDCAssoTokenAccount, "USDC")
      );

      await fs.rm(path.resolve(KEYS_FOLDER, "escrowAccount"), {
        recursive: true,
        force: true,
      });

      await fs.rm(path.resolve(KEYS_FOLDER, "aliceTempToken"), {
        recursive: true,
        force: true,
      });
    }
  }
})();

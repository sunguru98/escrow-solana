import fs from "fs-extra";
import path from "path";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  BOB_EXPECTED_USDC_TOKEN_AMOUNT,
  ESCROW_PROGRAM_ID,
  KEYS_FOLDER,
  LAYOUTS,
  SOLANA_CONNECTION,
} from "./constants";
import { EscrowLayout } from "./types";
import { getKeypair, getPublicKey, sleep } from "./utils";

(async function () {
  if (!fs.pathExists(KEYS_FOLDER)) {
    console.log(
      "Looks like you haven't stored alice, bob and master account's keypairs"
    );

    console.log("Use yarn store to create it :)");
    return;
  }

  const alice = await getKeypair("alice");
  const bob = await getKeypair("bob");
  const bobUSDCAssoTokenAccount = await getPublicKey("bobUSDCToken");
  const bobUSDTTokenAssoAccount = await getPublicKey("bobUSDTToken");
  const tempUSDCTokenAccount = await getPublicKey("aliceTempToken");
  const aliceUSDTAssoTokenAccount = await getPublicKey("aliceUSDTToken");
  const escrowStateAccount = await getPublicKey("escrowAccount");

  if (
    alice &&
    bob &&
    bobUSDCAssoTokenAccount &&
    bobUSDTTokenAssoAccount &&
    tempUSDCTokenAccount &&
    aliceUSDTAssoTokenAccount &&
    escrowStateAccount
  ) {
    const escrowAccountInfo = await SOLANA_CONNECTION.getAccountInfo(
      escrowStateAccount
    );

    const tempAccountInfo = await SOLANA_CONNECTION.getAccountInfo(
      tempUSDCTokenAccount
    );

    if (escrowAccountInfo && tempAccountInfo) {
      const { escrowPDABump } = LAYOUTS["escrowAccountLayout"].decode(
        escrowAccountInfo?.data
      ) as EscrowLayout;

      const escrowPDA = await PublicKey.createProgramAddress(
        [Buffer.from("escrow"), alice.publicKey.toBytes(), escrowPDABump],
        ESCROW_PROGRAM_ID
      );

      const exchange_esrow_instruction = new TransactionInstruction({
        programId: ESCROW_PROGRAM_ID,
        keys: [
          {
            isSigner: true,
            isWritable: false,
            pubkey: bob.publicKey,
          },
          {
            isSigner: false,
            isWritable: true,
            pubkey: bobUSDTTokenAssoAccount,
          },
          {
            isSigner: false,
            isWritable: true,
            pubkey: bobUSDCAssoTokenAccount,
          },
          {
            isSigner: false,
            isWritable: true,
            pubkey: tempUSDCTokenAccount,
          },
          {
            isSigner: false,
            isWritable: true,
            pubkey: alice.publicKey,
          },
          {
            isSigner: false,
            isWritable: true,
            pubkey: aliceUSDTAssoTokenAccount,
          },
          {
            isSigner: false,
            isWritable: true,
            pubkey: escrowStateAccount,
          },
          {
            isSigner: false,
            isWritable: false,
            pubkey: TOKEN_PROGRAM_ID,
          },
          {
            isSigner: false,
            isWritable: false,
            pubkey: escrowPDA,
          },
        ],
        data: Buffer.from(
          Uint8Array.of(
            1,
            ...new BN(BOB_EXPECTED_USDC_TOKEN_AMOUNT).toArray("le", 8)
          )
        ),
      });

      await fetchAndPrintBalances(
        aliceUSDTAssoTokenAccount,
        bobUSDCAssoTokenAccount
      );

      console.log("SENDING ESCROW EXCHANGE TRANSACTION");

      await SOLANA_CONNECTION.sendTransaction(
        new Transaction().add(exchange_esrow_instruction),
        [bob],
        { skipPreflight: false, preflightCommitment: "confirmed" }
      );

      console.log("SLEEPING FOR TWO SECONDS TO GET DATA");
      await sleep(2000);

      const tempTokenAccountInfo = await SOLANA_CONNECTION.getAccountInfo(
        tempUSDCTokenAccount
      );

      const newEscrowAccountInfo = await SOLANA_CONNECTION.getAccountInfo(
        escrowStateAccount
      );

      if (tempTokenAccountInfo === null && newEscrowAccountInfo === null) {
        console.log("ACCOUNTS ARE CLOSED SUCCESSFULLY. TRADE COMPLETE :)");
        await fetchAndPrintBalances(
          aliceUSDTAssoTokenAccount,
          bobUSDCAssoTokenAccount
        );

        await fs.rm(path.resolve(KEYS_FOLDER, "escrowAccount"), {
          recursive: true,
          force: true,
        });

        await fs.rm(path.resolve(KEYS_FOLDER, "aliceTempToken"), {
          recursive: true,
          force: true,
        });

        console.log("DONE");
      } else
        throw new Error(
          "Accounts are not closed correctly. Please check the smart contract"
        );
    } else {
      console.log("ESCROW ACCOUNT UNAVAILABLE");
    }
  } else {
    console.error("Missing accounts required for transaction");
  }
})();

async function fetchAndPrintBalances(
  aliceYToken: PublicKey,
  bobXToken: PublicKey
) {
  console.log(
    "BOB USDC Balance and Alice USDT Balance before transaction",
    `${
      parseInt(
        (await SOLANA_CONNECTION.getTokenAccountBalance(bobXToken)).value.amount
      ) /
      10 ** 6
    } USDC`,
    `${
      parseInt(
        (await SOLANA_CONNECTION.getTokenAccountBalance(aliceYToken)).value
          .amount
      ) /
      10 ** 6
    } USDT`
  );
}

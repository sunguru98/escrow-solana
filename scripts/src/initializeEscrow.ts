import { PublicKey } from "@solana/web3.js";
import {
  BOB_EXPECTED_USDC_TOKEN_AMOUNT,
  ESCROW_PROGRAM_ID,
  LAYOUTS,
  SOLANA_CONNECTION,
} from "./constants";
import {
  createEscrowInitializeTransaction,
  createTempTokenTransaction,
  transferTokensTransaction,
} from "./rawTransactions";
import { EscrowLayout } from "./types";
import {
  getKeypair,
  getMintPubKey,
  getPublicKey,
  sleep,
  writePublicKey,
} from "./utils";

(async function () {
  console.log("Escrow Initialize start");

  console.log("FETHCING USDC TOKEN MINT ACCOUNT");
  const usdcMint = await getMintPubKey("USDC");
  const usdtMint = await getMintPubKey("USDT");

  console.log("FETCHING ALICE KEYPAIR");
  const alice = await getKeypair("alice");

  console.log("FETCHING ALICE's USDC AND USDT ASSOC ACCOUNT");
  const aliceUSDCAssoTokenAccount = await getPublicKey("aliceUSDCToken");
  const aliceUSDTAssoTokenAccount = await getPublicKey("aliceUSDTToken");

  if (
    alice &&
    aliceUSDCAssoTokenAccount &&
    aliceUSDTAssoTokenAccount &&
    usdcMint
  ) {
    console.log("BUILDING TRANSACTION FOR TEMP ACCOUNT CREATION");
    const tempTokenRes = await createTempTokenTransaction(
      alice.publicKey,
      usdcMint
    );
    if (tempTokenRes) {
      const { account: aliceTempTokenAccount, transaction } = tempTokenRes;
      const transferRes = await transferTokensTransaction(
        alice.publicKey,
        aliceUSDCAssoTokenAccount,
        aliceTempTokenAccount.publicKey,
        usdcMint,
        BOB_EXPECTED_USDC_TOKEN_AMOUNT,
        6,
        transaction
      );

      if (transferRes) {
        const { transaction } = transferRes;
        const escrowRes = await createEscrowInitializeTransaction(
          alice.publicKey,
          aliceTempTokenAccount.publicKey,
          aliceUSDTAssoTokenAccount,
          transaction
        );

        if (escrowRes) {
          const { transaction, account: escrowAccount } = escrowRes;
          await writePublicKey(
            "aliceTempToken",
            aliceTempTokenAccount.publicKey
          );

          await writePublicKey("escrowAccount", escrowAccount.publicKey);

          const signature = await SOLANA_CONNECTION.sendTransaction(
            transaction,
            [alice, tempTokenRes.account, escrowRes.account],
            {
              skipPreflight: false,
              preflightCommitment: "confirmed",
            }
          );

          console.log("DONEEEEE", signature);

          console.log("SLEEPING FOR A SECOND TO GET DATA");
          await sleep(1000);

          const escrowAccountInfo = await SOLANA_CONNECTION.getAccountInfo(
            escrowRes.account.publicKey
          );

          if (escrowAccountInfo) {
            const { data } = escrowAccountInfo;
            const {
              isInitialized,
              alicePubKey,
              aliceTempXTokenPubKey,
              aliceYTokenPubKey,
              expectedYTokenAmount,
              escrowPDABump,
            } = LAYOUTS["escrowAccountLayout"].decode(data) as EscrowLayout;

            console.log("ESCROW IS_INITIALIZED", isInitialized === 1);
            console.log(
              "ESCROW ALICE_PUBKEY",
              new PublicKey(alicePubKey).toString()
            );
            console.log(
              "ESCROW ALICE_TEMP_X_TOKEN_PUBKEY",
              new PublicKey(aliceTempXTokenPubKey).toString()
            );
            console.log(
              "ESCROW ALICE_Y_TOKEN_PUBKEY",
              new PublicKey(aliceYTokenPubKey).toString()
            );
            console.log("ESCROW EXPECTED_Y_TOKEN_AMOUNT", expectedYTokenAmount);
            console.log("ESCROW PDA BUMP", escrowPDABump);
          }
        }
      }
    }
  }
})();

// (async function () {
//   const alice = await getKeypair("alice");
//   const pdas = await SOLANA_CONNECTION.getProgramAccounts(ESCROW_PROGRAM_ID);
//   console.log(
//     "SIMPLE",
//     (
//       await PublicKey.findProgramAddress(
//         [Buffer.from("escrow"), alice?.publicKey.toBytes()!],
//         ESCROW_PROGRAM_ID
//       )
//     )[0].toString()
//   );
//   pdas.map(({ pubkey }) => {
//     console.log(pubkey.toString());
//   });
// })();

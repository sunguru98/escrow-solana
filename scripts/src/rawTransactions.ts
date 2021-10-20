import { Token, TOKEN_PROGRAM_ID, AccountLayout } from "@solana/spl-token";
import {
  PublicKey,
  Transaction,
  Keypair,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  SOLANA_CONNECTION,
  LAYOUTS,
  ESCROW_PROGRAM_ID,
  ALICE_EXPECTED_USDT_TOKEN_AMOUNT,
} from "./constants";
import { getMintPubKey } from "./utils";

export async function createTempTokenTransaction(
  owner: PublicKey,
  mint: PublicKey,
  previousTransaction: Transaction = new Transaction({
    feePayer: owner,
  })
) {
  try {
    // 1. Create Account IX
    const tempTokenAccount = Keypair.generate();
    const tokenAccountCreationIx = SystemProgram.createAccount({
      fromPubkey: owner,
      lamports: await Token.getMinBalanceRentForExemptAccount(
        SOLANA_CONNECTION
      ),
      newAccountPubkey: tempTokenAccount.publicKey,
      programId: TOKEN_PROGRAM_ID,
      space: AccountLayout.span,
    });

    // 2. Initialize Token Account IX
    const initTempTokenAccountIx = Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      mint,
      tempTokenAccount.publicKey,
      owner
    );

    // 3. Bundle up
    return {
      transaction: previousTransaction.add(
        tokenAccountCreationIx,
        initTempTokenAccountIx
      ),
      account: tempTokenAccount,
    };
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function transferTokensTransaction(
  owner: PublicKey,
  sourceTokenAccount: PublicKey,
  destinationTokenAccount: PublicKey,
  mint: PublicKey,
  amount: number,
  decimals: number,
  previousTransaction: Transaction = new Transaction({
    feePayer: owner,
  })
) {
  try {
    // Transfer IX
    const transferTokenIx = Token.createTransferCheckedInstruction(
      TOKEN_PROGRAM_ID,
      sourceTokenAccount,
      mint,
      destinationTokenAccount,
      owner,
      [],
      amount,
      decimals
    );

    return {
      transaction: previousTransaction.add(transferTokenIx),
      account: null,
    };
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function createEscrowInitializeTransaction(
  owner: PublicKey,
  ownerTempTokenAccount: PublicKey,
  ownerYTokenAccount: PublicKey,
  previousTransaction: Transaction = new Transaction({
    feePayer: owner,
  })
) {
  const usdcMint = await getMintPubKey("usdc");
  try {
    // 1. Creating new escrow account IX
    const escrowAccount = new Keypair();
    const space = LAYOUTS["escrowAccountLayout"].span;
    const escrowAccountCreationIx = SystemProgram.createAccount({
      fromPubkey: owner,
      lamports: await SOLANA_CONNECTION.getMinimumBalanceForRentExemption(
        space
      ),
      newAccountPubkey: escrowAccount.publicKey,
      programId: ESCROW_PROGRAM_ID,
      space,
    });

    // 2. Initialize Escrow Account IX
    const escrowInitializeIx = new TransactionInstruction({
      programId: ESCROW_PROGRAM_ID,
      data: Buffer.from(
        Uint8Array.of(
          0,
          ...new BN(ALICE_EXPECTED_USDT_TOKEN_AMOUNT).toArray("le", 8)
        )
      ),
      keys: [
        { isSigner: true, isWritable: false, pubkey: owner },
        { isSigner: false, isWritable: true, pubkey: ownerTempTokenAccount },
        { isSigner: false, isWritable: false, pubkey: ownerYTokenAccount },
        { isSigner: false, isWritable: true, pubkey: escrowAccount.publicKey },
        { isSigner: false, isWritable: false, pubkey: TOKEN_PROGRAM_ID },
      ],
    });

    return {
      transaction: previousTransaction.add(
        escrowAccountCreationIx,
        escrowInitializeIx
      ),
      account: escrowAccount,
    };
  } catch (err) {
    console.error(err);
    return null;
  }
}

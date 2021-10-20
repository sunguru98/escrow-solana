import { Token, AccountLayout } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { SOLANA_CONNECTION, SUNDEEP_ACCOUNT } from "./constants";
import {
  createAssociatedTokenAccount,
  createMintAccount,
  getPrivateKey,
  getPublicKey,
  getTokenAccountBalance,
  topupAccount,
  transferTokens,
} from "./utils";

(async function () {
  const alice = await getPublicKey("alice");
  const bob = await getPublicKey("bob");
  const { publicKey: masterAccount, privateKey: secretKey } = {
    publicKey: await getPublicKey("masterAccount"),
    privateKey: await getPrivateKey("masterAccount"),
  };

  if (alice && bob && masterAccount && secretKey) {
    console.log("ADDRESSES: MASTER ACCOUNT", masterAccount.toString());
    console.log("ADDRESSES: ALICE", alice.toString());
    console.log("ADDRESSES: BOB", bob.toString());

    console.log("TOPPING UP ALICE AND BOB");
    await topupAccount(alice, 100);
    await topupAccount(bob, 100);

    console.log("CREATING MINT ACCOUNTS");
    const usdcMintToken = await createMintAccount(
      new Keypair({ publicKey: masterAccount.toBytes(), secretKey }),
      { name: "USDC", decimals: 6 }
    );

    const usdtMintToken = await createMintAccount(
      new Keypair({ publicKey: masterAccount.toBytes(), secretKey }),
      { name: "USDT", decimals: 6 }
    );

    console.log("CREATING ASSOCIATED TOKEN ACCOUNTS");
    const aliceUSDCAssoTokenAccount = await createAssociatedTokenAccount(
      usdcMintToken,
      alice,
      "aliceUSDCToken"
    );

    const aliceUSDTAssoTokenAccount = await createAssociatedTokenAccount(
      usdtMintToken,
      alice,
      "aliceUSDTToken"
    );

    const bobUSDCAssoTokenAccount = await createAssociatedTokenAccount(
      usdcMintToken,
      bob,
      "bobUSDCToken"
    );

    const bobUSDTAssoTokenAccount = await createAssociatedTokenAccount(
      usdtMintToken,
      bob,
      "bobUSDTToken"
    );

    const tokenData = (
      await SOLANA_CONNECTION.getAccountInfo(aliceUSDCAssoTokenAccount)
    )?.data;

    const tokenDecodedData = AccountLayout.decode(tokenData);
    console.log(
      new PublicKey(tokenDecodedData.mint).toString(),
      new PublicKey(tokenDecodedData.owner).toString()
    );

    console.log("MINTING 1000 USDC TO ALICE AND BOB");
    await usdcMintToken.mintTo(
      aliceUSDCAssoTokenAccount,
      masterAccount,
      [],
      1000 * 10 ** 6
    );
    await usdcMintToken.mintTo(
      bobUSDCAssoTokenAccount,
      masterAccount,
      [],
      1000 * 10 ** 6
    );

    console.log("MINTING 1000 USDT TO ALICE AND BOB");
    await usdtMintToken.mintTo(
      aliceUSDTAssoTokenAccount,
      masterAccount,
      [],
      1000 * 10 ** 6
    );
    await usdtMintToken.mintTo(
      bobUSDTAssoTokenAccount,
      masterAccount,
      [],
      1000 * 10 ** 6
    );

    console.log("FINAL BALANCES");
    console.log("ALICE:");
    console.log(
      await getTokenAccountBalance(aliceUSDCAssoTokenAccount, "USDC")
    );
    console.log(
      await getTokenAccountBalance(aliceUSDCAssoTokenAccount, "USDT")
    );

    console.log("BOB:");
    console.log(await getTokenAccountBalance(bobUSDCAssoTokenAccount, "USDC"));
    console.log(await getTokenAccountBalance(bobUSDCAssoTokenAccount, "USDT"));

    console.log("SETUP COMPLETE :)");
  }
})();

const transferToSundeep = async (
  tokenAccount: PublicKey,
  mint: Token,
  sender: PublicKey
) => {
  console.log("TRANSFERRING USDC FROM ALICE TO SUNDEEP");
  await transferTokens(
    "alice",
    tokenAccount,
    sender,
    SUNDEEP_ACCOUNT,
    mint,
    100,
    6
  );
};

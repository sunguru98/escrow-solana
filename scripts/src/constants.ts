import {
  AccountLayout,
  MintLayout,
  TOKEN_PROGRAM_ID as tPid,
} from "@solana/spl-token";
import { generateKeypair } from "./utils";
import path from "path";
import { Connection, PublicKey } from "@solana/web3.js";
import { u8, struct, blob } from "@solana/buffer-layout";

export const KEYS_FOLDER = path.resolve(__dirname, "../", "keys");

export const SUNDEEP_ACCOUNT = new PublicKey(
  "81sWMLg1EgYps3nMwyeSW1JfjKgFqkGYPP85vTnkFzRn"
);
export const ALICE_EXPECTED_USDT_TOKEN_AMOUNT = 10 * 10 ** 6;
export const BOB_EXPECTED_USDC_TOKEN_AMOUNT = 5 * 10 ** 6;

export const ESCROW_PROGRAM_ID = new PublicKey(
  "FZoqAsnuaq832FezFs7bNeuNtHHg7c8QsnJqmKM9JpCm"
);
export const SYSTEM_PROGRAM_ID = new PublicKey(
  "11111111111111111111111111111111"
);
export const TOKEN_PROGRAM_ID = tPid;
export const NETWORKS = {
  localhost: "http://localhost:8899",
};
export const SOLANA_CONNECTION = new Connection(
  NETWORKS["localhost"],
  "confirmed"
);

export const KEYPAIRS = {
  alice: generateKeypair(),
  bob: generateKeypair(),
  masterAccount: generateKeypair(),
};

export const LAYOUTS = {
  tokenAccountLayout: AccountLayout,
  mintAccountLayout: MintLayout,
  escrowAccountLayout: struct(
    [
      u8("isInitialized"),
      blob(32, "alicePubKey"),
      blob(32, "aliceTempXTokenPubKey"),
      blob(32, "aliceYTokenPubKey"),
      blob(8, "expectedYTokenAmount"),
      blob(1, "escrowPDABump"),
    ],
    "EscrowState"
  ),
};

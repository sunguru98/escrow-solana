export type EscrowLayout = {
  isInitialized: number;
  alicePubKey: Uint8Array;
  aliceTempXTokenPubKey: Uint8Array;
  aliceYTokenPubKey: Uint8Array;
  expectedYTokenAmount: Uint8Array;
  escrowPDABump: Uint8Array;
};

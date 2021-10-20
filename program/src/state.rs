use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{program_pack::IsInitialized, pubkey::Pubkey};
// use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct EscrowState {
    pub is_initialized: bool,
    pub alice_pubkey: Pubkey,
    pub alice_temp_x_token_pubkey: Pubkey,
    pub alice_y_token_pubkey: Pubkey,
    pub expected_y_token_amount: u64,
    pub escrow_pda_bump: u8,
}

impl IsInitialized for EscrowState {
    fn is_initialized(&self) -> bool {
        return self.is_initialized;
    }
}

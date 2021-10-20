use std::convert::TryInto;

use solana_program::program_error::ProgramError;

// inside instruction.rs
pub enum EscrowInstruction {
    /// Starts the trade by creating a PDA and populating an escrow account and transferring ownership of the given temp token account to the PDA
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` Alice's account (signer coz this is the one who invokes the escrow)
    /// 1. `[writable]` Alice's X Temporary account (should be created in prior, writable coz owbership transfer)
    /// 2. `[]` Alice's Y Token Account
    /// 3. `[writable]` Escrow Account (Created prior as well)
    /// 4. Token program
    InitializeEscrow {
        /// Token Y amount Alice expects
        expected_y_token_amount: u64,
    },

    /// Accepts a trade
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` Bob's account (signer coz this is the one who takes the amount)
    /// 1. `[writable]` Bob's Y Token Account
    /// 2. `[writable]` Bob's X Token Account
    /// 3. `[writable]` PDA's Temp X Token Account (previously from Alice)
    /// 4. `[writable]` Alice's account (because rent fees are sent back once the temp token account and escrow state account are closed)
    /// 5. `[writable]` Alice's Y Token Account
    /// 6. `[writable]` Escrow State Account
    /// 7. `[]` Token Program
    /// 8. `[]` PDA of Escrow Program
    ExchangeEscrow { expected_x_token_amount: u64 },

    /// Cancels an ongoing trade
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` Alice's Account
    /// 1. `[writable]` Escrow State Account
    /// 2. `[writable]` Temporary Token X Account
    /// 3. `[writable]` Alice Token X Account
    /// 4. `[]` Token Program
    /// 5. `[]` PDA of Escrow Program
    CancelEscrow,
}

impl EscrowInstruction {
    fn unpack_token_data(data: &[u8]) -> Result<u64, ProgramError> {
        let expected_y_amount = data
            .get(0..8)
            .and_then(|slice| slice.try_into().ok())
            .map(|parsed_data| u64::from_le_bytes(parsed_data))
            .ok_or(ProgramError::InvalidInstructionData)?;

        Ok(expected_y_amount)
    }

    pub fn unpack_instruction(instruction_data: &[u8]) -> Result<Self, ProgramError> {
        // Instruction -> TAG + DATA
        let (tag, rest_data) = instruction_data
            .split_first()
            .ok_or(ProgramError::InvalidInstructionData)?;

        match tag {
            0 => Ok(Self::InitializeEscrow {
                // Parse data and send
                expected_y_token_amount: Self::unpack_token_data(rest_data)?,
            }),
            1 => Ok(Self::ExchangeEscrow {
                // Parse data and send
                expected_x_token_amount: Self::unpack_token_data(rest_data)?,
            }),
            2 => Ok(Self::CancelEscrow),
            _ => Err(ProgramError::InvalidInstructionData),
        }
    }
}

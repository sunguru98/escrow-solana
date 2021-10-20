use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    sysvar::{rent::Rent, Sysvar},
};
use spl_token::{
    id as token_program_id,
    instruction::{
        close_account as close_token_account, set_authority, transfer as token_transfer,
        AuthorityType::AccountOwner as TokenAccountOwner,
    },
    state::Account as TokenState,
};

use crate::{instruction::EscrowInstruction, state::EscrowState};

pub struct EscrowProcessor {}

impl EscrowProcessor {
    pub fn process_escrow_instruction(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        msg!("Instruction starts :)");

        let parsed_instruction = EscrowInstruction::unpack_instruction(instruction_data)?;

        match parsed_instruction {
            EscrowInstruction::InitializeEscrow {
                expected_y_token_amount,
            } => {
                msg!("Instruction: ESCROW INITIALIZE");
                Self::process_initialize_escrow(program_id, accounts, expected_y_token_amount)
            }

            EscrowInstruction::ExchangeEscrow {
                expected_x_token_amount,
            } => {
                msg!("Instruction: ESCROW EXCHANGE");
                Self::process_exchange_escrow(program_id, accounts, expected_x_token_amount)
            }

            EscrowInstruction::CancelEscrow => {
                msg!("Instruction: ESCROW CANCEL");
                Self::process_cancel_escrow(program_id, accounts)
            }
        }
    }

    // Initialize escrow processor
    fn process_initialize_escrow(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        expected_y_token_amount: u64,
    ) -> ProgramResult {
        /* ALL ACCOUNTS */
        let accounts_iterable = &mut accounts.iter();
        // Alice account
        let alice_account = next_account_info(accounts_iterable)?;
        // Alice temp X token account
        let alice_temp_x_token_account = next_account_info(accounts_iterable)?;
        // Alice Y token account (to store it in the state such that Bob's transaction knows where to send his)
        let alice_y_token_account = next_account_info(accounts_iterable)?;

        // Escrow state account (Created before transaction and this account's owner would be our program)
        let escrow_account = next_account_info(accounts_iterable)?;
        // Rent
        let rent = Rent::get()?;
        // Token Program ID
        let token_program = next_account_info(accounts_iterable)?;

        /* LOGIC STARTS */
        // Checking if Alice has signed the transaction
        if !alice_account.is_signer {
            msg!("Escrow Initialize: Caller has not signed the transaction");
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Checking if the passed account is actually a token account and not a mint account
        match TokenState::unpack(&alice_y_token_account.data.borrow()) {
            Ok(val) => val,
            Err(err) => {
                msg!("Escrow Initialize: Account passed is not a token account");
                return Err(err);
            }
        };

        // Checking if the passed token account's owner is the token program
        if !spl_token::check_id(alice_y_token_account.owner) {
            msg!("Escrow Initialize: Incorrect program id passed");
            return Err(ProgramError::IncorrectProgramId);
        }

        // Checking if the escrow state account is rent exempt
        let escrow_account_balance = escrow_account.lamports();
        let escrow_account_storage_size = escrow_account.data_len();
        if !rent.is_exempt(escrow_account_balance, escrow_account_storage_size) {
            msg!("Escrow Initialize: Escrow state account is not rent exempt");
            return Err(ProgramError::AccountNotRentExempt);
        }

        // Checking if the escrow state has already been initialized (only empty accounts can be initialized)
        let mut escrow_account_state =
            EscrowState::try_from_slice(&escrow_account.data.borrow()[..])?;

        if escrow_account_state.is_initialized() {
            msg!("Escrow Initialize: Account already initialized");
            return Err(ProgramError::AccountAlreadyInitialized);
        }

        // Generating a Program derived address for transferring ownership at that account
        let (escrow_program_derived_address, bump_seed) =
            Pubkey::find_program_address(&[b"escrow", &alice_account.key.to_bytes()], program_id);

        msg!(
            "GENERATED PROGRAM DERIVED ADDRESS: {}",
            escrow_program_derived_address.to_string()
        );

        // Setting the state for the escrow account
        escrow_account_state.is_initialized = true;
        escrow_account_state.expected_y_token_amount = expected_y_token_amount;
        escrow_account_state.alice_pubkey = *alice_account.key;
        escrow_account_state.alice_temp_x_token_pubkey = *alice_temp_x_token_account.key;
        escrow_account_state.alice_y_token_pubkey = *alice_y_token_account.key;
        escrow_account_state.escrow_pda_bump = bump_seed;

        escrow_account_state.serialize(&mut (&mut escrow_account.data.borrow_mut()[..]))?;

        // Cross Program Invocation (Token account ownership transfer to PDA)
        msg!("Transferring Alice temp X tokens to Escrow PDA");
        let transfer_temp_token_owner_to_pda_instruction = set_authority(
            token_program.key,
            alice_temp_x_token_account.key,
            Some(&escrow_program_derived_address),
            TokenAccountOwner,
            alice_account.key,
            &[&alice_account.key],
        )?;

        invoke(
            &transfer_temp_token_owner_to_pda_instruction,
            &[
                alice_temp_x_token_account.clone(),
                alice_account.clone(),
                token_program.clone(),
            ],
        )?;

        Ok(())
    }

    // Exchange escrow processor
    fn process_exchange_escrow(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        expected_x_token_amount: u64,
    ) -> ProgramResult {
        let mutable_accounts = &mut accounts.iter();

        // All Accounts
        let bob_account = next_account_info(mutable_accounts)?;
        let bob_y_token_account = next_account_info(mutable_accounts)?;
        let bob_x_token_account = next_account_info(mutable_accounts)?;
        let pda_temp_x_token_account = next_account_info(mutable_accounts)?;
        let alice_account = next_account_info(mutable_accounts)?;
        let alice_y_token_account = next_account_info(mutable_accounts)?;
        let escrow_account = next_account_info(mutable_accounts)?;
        let token_program = next_account_info(mutable_accounts)?;
        let escrow_program_pda = next_account_info(mutable_accounts)?;

        // All Account States
        let pda_temp_x_token_account_state =
            TokenState::unpack(&pda_temp_x_token_account.data.borrow())?;

        let escrow_account_state = EscrowState::try_from_slice(&escrow_account.data.borrow())?;

        // All PDAs
        let pda_seed_bump_combination: &[&[u8]] = &[
            b"escrow",
            &alice_account.key.to_bytes(),
            &[escrow_account_state.escrow_pda_bump],
        ];

        let checking_pda = Pubkey::create_program_address(pda_seed_bump_combination, program_id)?;

        msg!("DERIVED AGAIN PDA {}", checking_pda.to_string());
        msg!("RECEIVED PDA {}", escrow_program_pda.key.to_string());

        // BUSINESS LOGIC STARTS :)

        // Checking if Bob is the signer
        if !bob_account.is_signer {
            msg!("Escrow Exchange: Caller is not signer");
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Checking if the escrow's alice address is the same as passed address
        if !escrow_account_state.alice_pubkey.eq(alice_account.key) {
            msg!("Escrow Exchange: Passed Alice's address mismatch with Escrow state's alice address");
            return Err(ProgramError::InvalidAccountData);
        }

        // Checking if escrow's alice y token address is the same as passed y token address
        if !escrow_account_state
            .alice_y_token_pubkey
            .eq(alice_y_token_account.key)
        {
            msg!("Escrow Exchange: Passed Alice's Y Token address mismatch with Escrow state's Alice Y Token address");
            return Err(ProgramError::InvalidAccountData);
        }

        // Checking if correct PDA is passed
        if !checking_pda.eq(escrow_program_pda.key) {
            msg!("Escrow Exchange: Incorrect PDA passed");
            return Err(ProgramError::InvalidAccountData);
        }

        // Checking if passed PDA is off curve
        // if escrow_program_pda.key.is_on_curve() {
        //     msg!("Escrow Exchange: PDA on Curve");
        //     return Err(ProgramError::IllegalOwner);
        // }

        // Checking if passed pda_temp_token address is the same as escrow state's alice_temp_token address
        if !escrow_account_state
            .alice_temp_x_token_pubkey
            .eq(pda_temp_x_token_account.key)
        {
            msg!("Escrow Exchange: Escrow state's temp token pubkey mismatch with passed pda temp token pubkey");
            return Err(ProgramError::InvalidAccountData);
        }

        // Checking if pda's temp token account's amount is equal to what bob asked
        if expected_x_token_amount != pda_temp_x_token_account_state.amount {
            msg!("Escrow Exchange: Bob's expected x token amount mismatch with pda token account balance");
            return Err(ProgramError::InsufficientFunds);
        }

        // Transferring Y Tokens from Bob's Y Token Account to Alice's Y Token Account
        let transfer_y_tokens_to_alice_ix = token_transfer(
            &token_program_id(),
            &bob_y_token_account.key,
            &alice_y_token_account.key,
            &bob_account.key,
            &[&bob_account.key],
            escrow_account_state.expected_y_token_amount,
        )?;

        msg!("Transferring Y Tokens from Bob's Y Token Account to Alice's Y Token Account");

        invoke(
            &transfer_y_tokens_to_alice_ix,
            &[
                bob_y_token_account.clone(),
                alice_y_token_account.clone(),
                bob_account.clone(),
                token_program.clone(),
            ],
        )?;

        // Transferring tokens from PDA's Temp X token account to Bob's X token account
        let transfer_x_tokens_to_bob_ix = token_transfer(
            &token_program_id(),
            &pda_temp_x_token_account.key,
            &bob_x_token_account.key,
            &escrow_program_pda.key,
            &[&escrow_program_pda.key],
            pda_temp_x_token_account_state.amount,
        )?;

        msg!("Transferring X Tokens from PDA's Temp X Token Account to Bob's X Token Account");

        // Reason we are passing 4 account_infos is because excluding token_program, 2 (temp_x and bob_x) are the ones which have been creating using a KeyPair and initilalized with SystemProgram. 1 is the signer (escrow_pda) 2 is obviously the program which we are involving.

        invoke_signed(
            &transfer_x_tokens_to_bob_ix,
            &[
                pda_temp_x_token_account.clone(),
                bob_x_token_account.clone(),
                escrow_program_pda.clone(),
                token_program.clone(),
            ],
            &[pda_seed_bump_combination],
        )?;

        // Closing the PDA's Temp X Token account as there is no need to exist after transfer is complete
        let pda_temp_x_token_account_close_ix = close_token_account(
            &token_program_id(),
            &pda_temp_x_token_account.key,
            &alice_account.key,
            &escrow_program_pda.key,
            &[&escrow_program_pda.key],
        )?;

        msg!("Closing PDA's Temp X Token account");

        invoke_signed(
            &pda_temp_x_token_account_close_ix,
            &[
                pda_temp_x_token_account.clone(),
                alice_account.clone(),
                escrow_program_pda.clone(),
                token_program.clone(),
            ],
            &[pda_seed_bump_combination],
        )?;

        // Adding lamports to alice's account and decreasing from escrow state account;
        msg!("Closing Escrow State Account");
        let alice_account_balance = &mut alice_account.lamports();
        let escrow_account_balance = escrow_account.lamports();
        **alice_account.lamports.borrow_mut() = alice_account_balance
            .checked_add(escrow_account_balance)
            .ok_or(ProgramError::InsufficientFunds)?;

        **escrow_account.lamports.borrow_mut() = 0;
        *escrow_account.data.borrow_mut() = &mut [];

        Ok(())
    }

    // Cancel escrow processor
    fn process_cancel_escrow(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let accounts_iterable = &mut accounts.iter();
        // All accounts
        let alice_account = next_account_info(accounts_iterable)?;
        let escrow_account = next_account_info(accounts_iterable)?;
        let pda_temporary_x_token_account = next_account_info(accounts_iterable)?;
        let alice_x_token_account = next_account_info(accounts_iterable)?;
        let token_program = next_account_info(accounts_iterable)?;
        let escrow_pda_account = next_account_info(accounts_iterable)?;

        // Checking if passed escrow state account is owned by this program
        if !escrow_account.owner.eq(program_id) {
            msg!("Escrow Cancel: Incorrect Escrow State Account passed");
            return Err(ProgramError::IncorrectProgramId);
        }

        // All State unwrapping
        let escrow_account_state = EscrowState::try_from_slice(&escrow_account.data.borrow())?;

        // Checking if the escrow account's temp x token address matches with the passed x token account
        if !escrow_account_state
            .alice_temp_x_token_pubkey
            .eq(pda_temporary_x_token_account.key)
        {
            msg!("Escrow Cancel: Passed Temporary X Token address mismatch with Escrow State's");
            return Err(ProgramError::InvalidAccountData);
        }

        let pda_seed_bump_combination: &[&[u8]] = &[
            b"escrow",
            &alice_account.key.to_bytes(),
            &[escrow_account_state.escrow_pda_bump],
        ];

        // PDA
        let checking_pda_address =
            Pubkey::create_program_address(pda_seed_bump_combination, program_id)?;

        // Checking if the pda matches with the pda passed
        if !checking_pda_address.eq(escrow_pda_account.key) {
            msg!("Escrow Cancel: Escrow PDA mismatch");
            return Err(ProgramError::InvalidAccountData);
        }

        // BUSINESS LOGIC STARTS
        msg!("Transferring X Tokens back to Initializer X Token account");

        let temp_x_token_account_state =
            match TokenState::unpack(&pda_temporary_x_token_account.data.borrow()) {
                Ok(token_state) => token_state,
                Err(err) => {
                    msg!("Escrow Cancel: Incorrect Token account passed");
                    return Err(err);
                }
            };

        let transfer_x_tokens_to_alice_ix = token_transfer(
            &token_program_id(),
            &pda_temporary_x_token_account.key,
            &alice_x_token_account.key,
            &escrow_pda_account.key,
            &[&escrow_pda_account.key],
            temp_x_token_account_state.amount,
        )?;

        invoke_signed(
            &transfer_x_tokens_to_alice_ix,
            &[
                pda_temporary_x_token_account.clone(),
                alice_x_token_account.clone(),
                escrow_pda_account.clone(),
                token_program.clone(),
            ],
            &[pda_seed_bump_combination],
        )?;

        msg!("Closing the temporary X token account");

        let close_temp_x_tokens_ix = close_token_account(
            &token_program_id(),
            &pda_temporary_x_token_account.key,
            &alice_account.key,
            &escrow_pda_account.key,
            &[escrow_pda_account.key],
        )?;

        invoke_signed(
            &close_temp_x_tokens_ix,
            &[
                pda_temporary_x_token_account.clone(),
                alice_account.clone(),
                escrow_pda_account.clone(),
            ],
            &[pda_seed_bump_combination],
        )?;

        msg!("Closing the escrow state account");

        let escrow_state_account_balance = escrow_account.lamports();
        **alice_account.lamports.borrow_mut() = alice_account
            .lamports()
            .checked_add(escrow_state_account_balance)
            .ok_or(ProgramError::InsufficientFunds)?;

        **escrow_account.lamports.borrow_mut() = 0;
        *escrow_account.data.borrow_mut() = &mut [];

        Ok(())
    }
}

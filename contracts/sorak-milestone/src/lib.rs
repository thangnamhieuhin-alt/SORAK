#![no_std]

mod error;
mod storage;

#[cfg(test)]
mod test;

use error::Error;
use storage::{
    bump_instance, get_admin, get_supporters, get_tier, get_token, get_total, is_initialized,
    record_supporter, set_admin, set_tier, set_token, set_total,
};

use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, Env, Vec};

const TIER_THRESHOLDS: [i128; 3] = [50_0000000, 100_0000000, 500_0000000];

#[contract]
pub struct SorakMilestone;

#[contractimpl]
impl SorakMilestone {
    pub fn initialize(env: Env, admin: Address, token: Address) -> Result<(), Error> {
        if is_initialized(&env) {
            return Err(Error::AlreadyInitialized);
        }
        set_admin(&env, &admin);
        set_token(&env, &token);
        bump_instance(&env);
        env.events().publish((symbol_short!("init"),), (admin, token));
        Ok(())
    }

    pub fn record_tip(
        env: Env,
        creator: Address,
        supporter: Address,
        amount: i128,
    ) -> Result<u32, Error> {
        supporter.require_auth();
        if !is_initialized(&env) {
            return Err(Error::NotInitialized);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        move_tip_through_contract(&env, &supporter, &creator, amount);

        let new_total = get_total(&env, &creator, &supporter) + amount;
        set_total(&env, &creator, &supporter, new_total);
        record_supporter(&env, &creator, &supporter);

        let previous_tier = get_tier(&env, &creator, &supporter);
        let current_tier = tier_for_total(new_total);
        bump_instance(&env);

        let crossed = if current_tier > previous_tier {
            set_tier(&env, &creator, &supporter, current_tier);
            current_tier
        } else {
            0
        };

        env.events().publish(
            (symbol_short!("tip"), creator, supporter),
            (amount, new_total, crossed),
        );
        Ok(crossed)
    }

    pub fn total_given(env: Env, creator: Address, supporter: Address) -> i128 {
        get_total(&env, &creator, &supporter)
    }

    pub fn list_milestones(env: Env, creator: Address) -> Vec<(Address, u32)> {
        let supporters = get_supporters(&env, &creator);
        let mut out = Vec::new(&env);
        for supporter in supporters.iter() {
            let tier = get_tier(&env, &creator, &supporter);
            out.push_back((supporter, tier));
        }
        out
    }

    pub fn get_admin(env: Env) -> Address {
        get_admin(&env)
    }

    pub fn get_token(env: Env) -> Address {
        get_token(&env)
    }
}

fn tier_for_total(total: i128) -> u32 {
    let mut tier = 0u32;
    for threshold in TIER_THRESHOLDS.iter() {
        if total >= *threshold {
            tier += 1;
        }
    }
    tier
}

fn move_tip_through_contract(env: &Env, supporter: &Address, creator: &Address, amount: i128) {
    let token_client = token::Client::new(env, &get_token(env));
    let contract = env.current_contract_address();
    token_client.transfer(supporter, &contract, &amount);
    token_client.transfer(&contract, creator, &amount);
}

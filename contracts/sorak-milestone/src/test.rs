#![cfg(test)]

use crate::error::Error;
use crate::{SorakMilestone, SorakMilestoneClient};

use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{Address, Env};

const USDC: i128 = 1_0000000;

struct Setup<'a> {
    env: Env,
    client: SorakMilestoneClient<'a>,
    token: Address,
    token_client: TokenClient<'a>,
    sac_admin: StellarAssetClient<'a>,
    admin: Address,
    creator: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = sac.address();

    let contract_id = env.register(SorakMilestone, ());
    let client = SorakMilestoneClient::new(&env, &contract_id);
    client.initialize(&admin, &token);

    Setup {
        token_client: TokenClient::new(&env, &token),
        sac_admin: StellarAssetClient::new(&env, &token),
        creator: Address::generate(&env),
        env,
        client,
        token,
        admin,
    }
}

fn funded_supporter(s: &Setup) -> Address {
    let a = Address::generate(&s.env);
    s.sac_admin.mint(&a, &(1_000 * USDC));
    a
}

#[test]
fn initialize_sets_admin_and_token() {
    let s = setup();
    assert_eq!(s.client.get_admin(), s.admin);
    assert_eq!(s.client.get_token(), s.token);
    let res = s.client.try_initialize(&s.admin, &s.token);
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn tip_below_tier_one_stays_tier_zero() {
    let s = setup();
    let supporter = funded_supporter(&s);
    let crossed = s.client.record_tip(&s.creator, &supporter, &(40 * USDC));
    assert_eq!(crossed, 0);
    assert_eq!(s.client.total_given(&s.creator, &supporter), 40 * USDC);
    assert_eq!(s.token_client.balance(&s.creator), 40 * USDC);
}

#[test]
fn tip_crossing_fifty_returns_tier_one() {
    let s = setup();
    let supporter = funded_supporter(&s);
    s.client.record_tip(&s.creator, &supporter, &(40 * USDC));
    let crossed = s.client.record_tip(&s.creator, &supporter, &(15 * USDC));
    assert_eq!(crossed, 1);
    let milestones = s.client.list_milestones(&s.creator);
    assert_eq!(milestones.get(0).unwrap(), (supporter, 1));
}

#[test]
fn tip_crossing_hundred_after_tier_one_returns_tier_two() {
    let s = setup();
    let supporter = funded_supporter(&s);
    s.client.record_tip(&s.creator, &supporter, &(55 * USDC));
    let crossed = s.client.record_tip(&s.creator, &supporter, &(50 * USDC));
    assert_eq!(crossed, 2);
    assert_eq!(s.client.total_given(&s.creator, &supporter), 105 * USDC);
}

#[test]
fn tip_crossing_five_hundred_returns_tier_three() {
    let s = setup();
    let supporter = funded_supporter(&s);
    s.client.record_tip(&s.creator, &supporter, &(105 * USDC));
    let crossed = s.client.record_tip(&s.creator, &supporter, &(400 * USDC));
    assert_eq!(crossed, 3);
}

#[test]
fn tip_without_new_tier_returns_zero() {
    let s = setup();
    let supporter = funded_supporter(&s);
    s.client.record_tip(&s.creator, &supporter, &(505 * USDC));
    let crossed = s.client.record_tip(&s.creator, &supporter, &(10 * USDC));
    assert_eq!(crossed, 0);
    assert_eq!(s.client.list_milestones(&s.creator).get(0).unwrap(), (supporter, 3));
}

#[test]
fn total_given_accumulates_across_calls() {
    let s = setup();
    let supporter = funded_supporter(&s);
    s.client.record_tip(&s.creator, &supporter, &(10 * USDC));
    s.client.record_tip(&s.creator, &supporter, &(20 * USDC));
    s.client.record_tip(&s.creator, &supporter, &(5 * USDC));
    assert_eq!(s.client.total_given(&s.creator, &supporter), 35 * USDC);
}

#[test]
fn two_supporters_keep_independent_totals_and_tiers() {
    let s = setup();
    let alice = funded_supporter(&s);
    let bob = funded_supporter(&s);

    let alice_crossed = s.client.record_tip(&s.creator, &alice, &(60 * USDC));
    let bob_crossed = s.client.record_tip(&s.creator, &bob, &(10 * USDC));

    assert_eq!(alice_crossed, 1);
    assert_eq!(bob_crossed, 0);
    assert_eq!(s.client.total_given(&s.creator, &alice), 60 * USDC);
    assert_eq!(s.client.total_given(&s.creator, &bob), 10 * USDC);

    let milestones = s.client.list_milestones(&s.creator);
    assert_eq!(milestones.len(), 2);
    assert_eq!(milestones.get(0).unwrap(), (alice, 1));
    assert_eq!(milestones.get(1).unwrap(), (bob, 0));
}

#[test]
fn zero_amount_is_rejected() {
    let s = setup();
    let supporter = funded_supporter(&s);
    assert_eq!(
        s.client.try_record_tip(&s.creator, &supporter, &0),
        Err(Ok(Error::InvalidAmount))
    );
}

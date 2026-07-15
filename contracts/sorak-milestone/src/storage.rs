use soroban_sdk::{contracttype, Address, Env, Vec};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Total(Address, Address),
    Tier(Address, Address),
    Supporters(Address),
}

pub const DAY_IN_LEDGERS: u32 = 17_280;
pub const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
pub const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;
pub const PERSIST_BUMP_AMOUNT: u32 = 90 * DAY_IN_LEDGERS;
pub const PERSIST_LIFETIME_THRESHOLD: u32 = PERSIST_BUMP_AMOUNT - DAY_IN_LEDGERS;

pub fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

pub fn set_token(env: &Env, token: &Address) {
    env.storage().instance().set(&DataKey::Token, token);
}

pub fn get_token(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Token).unwrap()
}

pub fn is_initialized(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Admin)
}

pub fn get_total(env: &Env, creator: &Address, supporter: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Total(creator.clone(), supporter.clone()))
        .unwrap_or(0)
}

pub fn set_total(env: &Env, creator: &Address, supporter: &Address, amount: i128) {
    let key = DataKey::Total(creator.clone(), supporter.clone());
    env.storage().persistent().set(&key, &amount);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSIST_LIFETIME_THRESHOLD, PERSIST_BUMP_AMOUNT);
}

pub fn get_tier(env: &Env, creator: &Address, supporter: &Address) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::Tier(creator.clone(), supporter.clone()))
        .unwrap_or(0)
}

pub fn set_tier(env: &Env, creator: &Address, supporter: &Address, tier: u32) {
    let key = DataKey::Tier(creator.clone(), supporter.clone());
    env.storage().persistent().set(&key, &tier);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSIST_LIFETIME_THRESHOLD, PERSIST_BUMP_AMOUNT);
}

pub fn get_supporters(env: &Env, creator: &Address) -> Vec<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::Supporters(creator.clone()))
        .unwrap_or(Vec::new(env))
}

pub fn record_supporter(env: &Env, creator: &Address, supporter: &Address) {
    let mut supporters = get_supporters(env, creator);
    if !supporters.contains(supporter) {
        supporters.push_back(supporter.clone());
        let key = DataKey::Supporters(creator.clone());
        env.storage().persistent().set(&key, &supporters);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSIST_LIFETIME_THRESHOLD, PERSIST_BUMP_AMOUNT);
    }
}

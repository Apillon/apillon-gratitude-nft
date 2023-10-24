use ink::{
    prelude::string::String as PreludeString,
    storage::Mapping,
};
use openbrush::{
    contracts::{
        access_control::{self, DEFAULT_ADMIN_ROLE, only_role, RoleType},
        psp34::extensions::{enumerable::*, metadata::*},
    },
    modifiers,
    traits::{AccountId, Storage, String},
};

use crate::internal::{Error, Internal, PinkError};
use crate::traits::PinkMint;

pub const ADMIN: RoleType = DEFAULT_ADMIN_ROLE;

pub const STORAGE_MINTING_KEY: u32 = openbrush::storage_unique_key!(MintingData);

#[derive(Default, Debug)]
#[openbrush::upgradeable_storage(STORAGE_MINTING_KEY)]
pub struct MintingData {
    pub last_token_id: u64,
    pub max_supply: Option<u64>,
    pub limit_per_account: u32,
    pub nft_metadata: Mapping<Id, String>,
}

impl<T> PinkMint for T
    where
        T: Storage<MintingData>
        + Storage<psp34::Data<enumerable::Balances>>
        + Storage<access_control::Data>
        + Storage<metadata::Data>
        + psp34::extensions::metadata::PSP34Metadata
        + psp34::Internal,
{
    /// Mint one token to the specified account.
    #[modifiers(only_role(ADMIN))]
    default fn mint(&mut self, to: AccountId, metadata: String) -> Result<Id, Error> {
        self._check_amount(1)?;
        self._check_limit(to)?;
        let minted_id = self._mint(to)?;

        self.data::<MintingData>()
            .nft_metadata
            .insert(minted_id.clone(), &metadata);

        Ok(minted_id)
    }

    /// Change metadata for the token Id.
    #[modifiers(only_role(ADMIN))]
    default fn change_metadata(&mut self, token: Id, metadata: String) -> Result<(), Error> {
        if self
            .data::<MintingData>()
            .nft_metadata
            .contains(token.clone())
        {
            self.data::<MintingData>()
                .nft_metadata
                .insert(token, &metadata);
            Ok(())
        } else {
            Err(PinkError::TokenNotFound.into())
        }
    }

    /// Set max supply of tokens.
    #[modifiers(only_role(ADMIN))]
    default fn set_max_supply(&mut self, max_supply: Option<u64>) -> Result<(), Error> {
        self.data::<MintingData>().max_supply = max_supply;
        Ok(())
    }

    /// Set max amount of tokens to be minted per account.
    #[modifiers(only_role(ADMIN))]
    default fn set_limit_per_account(&mut self, limit: u32) -> Result<(), Error> {
        self.data::<MintingData>().limit_per_account = limit;
        Ok(())
    }

    /// Get max amount of tokens to be minted per account.
    default fn limit_per_account(&self) -> u32 {
        self.data::<MintingData>().limit_per_account
    }

    /// Get max supply of tokens.
    default fn max_supply(&self) -> Option<u64> {
        self.data::<MintingData>().max_supply
    }

    /// Get URI for the token Id.
    default fn token_uri(&self, token_id: u64) -> Result<PreludeString, Error> {
        self.data::<psp34::Data<enumerable::Balances>>()
            .owner_of(Id::U64(token_id.clone()))
            .ok_or(PinkError::TokenNotFound)?;

        self._token_uri(token_id)
    }
}

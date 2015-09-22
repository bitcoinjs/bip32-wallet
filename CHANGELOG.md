# 0.5.0
Warning, `createTransaction` may be removed in a future version, with this package being merged with `bip32-utils` to form purely BIP32 key management.

The functionality of transaction formulation that is currently found in `createTransaction` (and the `coinSelect` package) will likely be moved to a new module.

* removes `getUnspentOutputs`, `setUnspentOutputs` and `signWith`
* changed `createTransaction` parameters to `inputs, outputs, wantedFee, external, internal`

# 0.4.1
* removes `.addresses` from chain JSON,  was deterministic

# 0.4.0
* removes `Wallet.getConfirmedBalance`, `confirmations` no longer used in the API, you must now filter unspents yourself prior to use

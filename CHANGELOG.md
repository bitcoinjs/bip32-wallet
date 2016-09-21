# 0.7.0
* adds `buildTransaction`, WARNING: different API, maxFee is the maximum fee for transaction sanitization
* removes `createTransaction`
* bumps `async` to `2.0.0`
* bumps `bitcoinjs` to `^2.3.0`

# 0.6.1
* bumps `async` to `1.5.0`
* bumps `bitcoinjs` to `^2.2.0`

# 0.6.0
* adds optional `nLockTime` parameter to `createTransaction`

# 0.5.0
Warning, `createTransaction` may be removed in a future version, with this package being merged with `bip32-utils` to form purely BIP32 key management.

The functionality of transaction formulation that is currently found in `createTransaction` (and the `coinSelect` package) will likely be moved to a new module.

* removes `getUnspentOutputs`, `setUnspentOutputs` and `signWith`
* changed `createTransaction` parameters to `inputs, outputs, wantedFee, external, internal`

# 0.4.1
* removes `.addresses` from chain JSON,  was deterministic

# 0.4.0
* removes `Wallet.getConfirmedBalance`, `confirmations` no longer used in the API, you must now filter unspents yourself prior to use

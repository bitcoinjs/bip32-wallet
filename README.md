# bip32-wallet

[![TRAVIS](https://secure.travis-ci.org/bitcoinjs/bip32-wallet.png)](http://travis-ci.org/bitcoinjs/bip32-wallet)
[![NPM](https://img.shields.io/npm/v/bip32-wallet.svg)](https://www.npmjs.org/package/bip32-wallet)

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

A BIP32 Wallet backed by bitcoinjs-lib, lite on features but heavily tested.

## Derivation

Derivation path of `m/0'/i/k`,  where `i` is the account (external or internal) and `k` is the leaf node (for addresses).

![structure](https://github.com/bitcoin/bips/raw/master/bip-0032/derivation.png)

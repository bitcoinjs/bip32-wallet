var bip32utils = require('bip32-utils')
var bip69 = require('bip69')
var bitcoin = require('bitcoinjs-lib')
var each = require('async-each')
var networks = bitcoin.networks
var selectInputs = require('./selection')

function Wallet (external, internal) {
  var chains
  if (Array.isArray(external)) {
    chains = external
    this.external = chains[0].getParent()
    this.internal = chains[1].getParent()

  } else {
    chains = [new bip32utils.Chain(external), new bip32utils.Chain(internal)]

    this.external = external
    this.internal = internal
  }

  this.account = new bip32utils.Account(chains)
  this.unspents = []
}

Wallet.fromJSON = function (json) {
  function toChain (cjson) {
    var chain = new bip32utils.Chain(bitcoin.HDNode.fromBase58(cjson.node), cjson.k)
    chain.addresses = cjson.addresses
    chain.map = cjson.map

    return chain
  }

  var chains
  if (json.chains) {
    chains = json.chains.map(toChain)
  } else if (json.external) {
    chains = [toChain(json.external), toChain(json.internal)]
  }

  var wallet = new Wallet(chains)
  wallet.unspents = json.unspents

  return wallet
}

Wallet.fromSeedBuffer = function (seed, network) {
  network = network || networks.bitcoin

  // HD first-level child derivation method should be hardened
  // See https://bitcointalk.org/index.php?topic=405179.msg4415254#msg4415254
  var m = bitcoin.HDNode.fromSeedBuffer(seed, network)
  var i = m.deriveHardened(0)
  var external = i.derive(0)
  var internal = i.derive(1)

  return new Wallet(external, internal)
}

Wallet.prototype.createTransaction = function (outputs, external, internal) {
  external = external || this.external
  internal = internal || this.internal
  var network = this.getNetwork()

  var selection = selectInputs(this.unspents, outputs, network.feePerKb)
  var remainder = selection.remainder
  var fee = selection.fee
  var inputs = selection.inputs

  // sanity checks
  var totalInputValue = inputs.reduce(function (a, x) { return a + x.value }, 0)
  var totalOutputValue = outputs.reduce(function (a, x) { return a + x.value }, 0)
  var totalUnused = remainder + fee

  if (totalInputValue - totalOutputValue !== totalUnused) throw new Error('Unexpected change/fee, please report this')
  if (selection.fee > 0.1 * 1e8) throw new Error('Absurd fee: ' + selection.fee)

  // take a copy of the outputs
  outputs = outputs.concat()

  // is the remainder non-dust?
  if (remainder > network.dustThreshold) {
    outputs.push({
      address: this.getChangeAddress(),
      value: remainder
    })

  // ignore the remainder, combine with the fee
  } else {
    fee = fee + remainder
    remainder = 0
  }

  // apply BIP69 for improved privacy
  inputs = bip69.sortInputs(inputs)
  outputs = bip69.sortOutputs(outputs)

  // build transaction
  var txb = new bitcoin.TransactionBuilder()
  inputs.forEach(function (input) {
    txb.addInput(input.txId, input.vout)
  })
  outputs.forEach(function (output) {
    txb.addOutput(output.address, output.value)
  })

  // sign and return
  var addresses = inputs.map(function (input) { return input.address })
  var transaction = this.signWith(txb, addresses, external, internal).build()

  return {
    change: remainder,
    fee: fee,
    transaction: transaction
  }
}

Wallet.prototype.containsAddress = function (address) { return this.account.containsAddress(address) }
Wallet.prototype.discover = function (gapLimit, queryCallback, done) {
  function discoverChain (chain, callback) {
    bip32utils.discovery(chain, gapLimit, queryCallback, function (err, used, checked) {
      if (err) return callback(err)

      // throw away ALL unused addresses AFTER the last unused address
      var unused = checked - used
      for (var i = 1; i < unused; ++i) chain.pop()

      return callback()
    })
  }

  each(this.account.getChains(), discoverChain, done)
}
Wallet.prototype.getAllAddresses = function () { return this.account.getAllAddresses() }
Wallet.prototype.getBalance = function () {
  return this.unspents.reduce(function (accum, unspent) {
    return accum + unspent.value
  }, 0)
}
Wallet.prototype.getNetwork = function () { return this.account.getNetwork() }
Wallet.prototype.getReceiveAddress = function () { return this.account.getChainAddress(0) }
Wallet.prototype.getChangeAddress = function () { return this.account.getChainAddress(1) }
Wallet.prototype.isReceiveAddress = function (address) { return this.account.isChainAddress(0, address) }
Wallet.prototype.isChangeAddress = function (address) { return this.account.isChainAddress(1, address) }
Wallet.prototype.nextReceiveAddress = function () { return this.account.nextChainAddress(0) }
Wallet.prototype.nextChangeAddress = function () { return this.account.nextChainAddress(1) }

Wallet.prototype.getUnspentOutputs = function (unspents) { return this.unspents }
Wallet.prototype.setUnspentOutputs = function (unspents) {
  var seen = {}

  unspents.forEach(function (unspent) {
    var shortId = unspent.txId + ':' + unspent.vout
    if (seen[shortId]) throw new Error('Duplicate unspent ' + shortId)

    seen[shortId] = true
  })

  this.unspents = unspents
}

Wallet.prototype.signWith = function (tx, addresses, external, internal) {
  external = external || this.external
  internal = internal || this.internal

  var children = this.account.getChildren(addresses, [external, internal])

  children.forEach(function (node, i) {
    tx.sign(i, node.privKey)
  })

  return tx
}

Wallet.prototype.toJSON = function () {
  var chains = this.account.chains.map(function (chain) {
    return {
      addresses: chain.addresses,
      map: chain.map,
      k: chain.k,
      node: chain.getParent().toBase58()
    }
  })

  return {
    external: chains[0],
    internal: chains[1],
    unspents: this.unspents
  }
}

module.exports = Wallet

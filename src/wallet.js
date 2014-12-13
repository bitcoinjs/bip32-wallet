var assert = require('assert')

var bitcoin = require('bitcoinjs-lib')
var bip32utils = require('bip32-utils')
var networks = bitcoin.networks

var selectInputs = require('./selection')

function Wallet(external, internal) {
  this.account = new bip32utils.Account(external, internal)
  this.external = external
  this.internal = internal
  this.unspents = []
}

Wallet.fromJSON = function(json) {
  var external = bitcoin.HDNode.fromBase58(json.external.node)
  var internal = bitcoin.HDNode.fromBase58(json.internal.node)
  var wallet = new Wallet(external, internal)
  wallet.account.external.addresses = json.external.addresses
  wallet.account.internal.addresses = json.internal.addresses
  wallet.account.external.map = json.external.map
  wallet.account.internal.map = json.internal.map
  wallet.account.external.k = json.k
  wallet.account.internal.k = json.k
  wallet.unspents = json.unspents

  return wallet
}

Wallet.fromSeedBuffer = function(seed, network) {
  network = network || networks.bitcoin

  // HD first-level child derivation method should be hardened
  // See https://bitcointalk.org/index.php?topic=405179.msg4415254#msg4415254
  var m = bitcoin.HDNode.fromSeedBuffer(seed, network)
  var i = m.deriveHardened(0)
  var external = i.derive(0)
  var internal = i.derive(1)

  return new Wallet(external, internal)
}

Wallet.prototype.createTransaction = function(outputs, external, internal) {
  external = external || this.external
  internal = internal || this.internal
  var network = this.getNetwork()

  // filter un-confirmed
  var unspents = this.unspents.filter(function(unspent) {
    return unspent.confirmations > 0
  })

  var selection = selectInputs(unspents, outputs, network)
  var inputs = selection.inputs

  // sanity check (until things are battle tested)
  var totalInputValue = inputs.reduce(function(a, x) { return a + x.value }, 0)
  var totalOutputValue = outputs.reduce(function(a, x) { return a + x.value }, 0)
  assert.equal(totalInputValue - totalOutputValue, selection.change + selection.fee)

  // ensure fee isn't crazy (max 0.1 BTC)
  assert(selection.fee < 0.1 * 1e8, 'Very high fee: ' + selection.fee)

  // build transaction
  var txb = new bitcoin.TransactionBuilder()

  inputs.forEach(function(input) {
    txb.addInput(input.txId, input.vout)
  })

  outputs.forEach(function(output) {
    txb.addOutput(output.address, output.value)
  })

  var change, fee

  // is the change worth it?
  if (selection.change > network.dustThreshold) {
    var changeAddress = this.getChangeAddress()

    txb.addOutput(changeAddress, selection.change)

    change = selection.change
    fee = selection.fee

  } else {
    change = 0
    fee = selection.change + selection.fee

  }

  // sign and return
  var addresses = inputs.map(function(input) { return input.address })
  var transaction = this.signWith(txb, addresses, external, internal).build()

  return {
    fee: fee,
    change: change,
    transaction: transaction
  }
}

Wallet.prototype.containsAddress = function(address) { return this.account.containsAddress(address) }
Wallet.prototype.getAllAddresses = function() { return this.account.getAllAddresses() }
Wallet.prototype.getBalance = function() {
  return this.unspents.reduce(function(accum, unspent) {
    return accum + unspent.value
  }, 0)
}
Wallet.prototype.getChangeAddress = function() { return this.account.getInternalAddress() }
Wallet.prototype.getConfirmedBalance = function() {
  return this.unspents.filter(function(unspent) {
    return unspent.confirmations > 0

  }).reduce(function(accum, unspent) {
    return accum + unspent.value
  }, 0)
}
Wallet.prototype.getNetwork = function() { return this.account.getNetwork() }
Wallet.prototype.getReceiveAddress = function() { return this.account.getExternalAddress() }
Wallet.prototype.isChangeAddress = function(address) { return this.account.isInternalAddress(address) }
Wallet.prototype.isReceiveAddress = function(address) { return this.account.isExternalAddress(address) }
Wallet.prototype.nextAddress = function() { return this.account.nextAddress() }

Wallet.prototype.setUnspentOutputs = function(unspents) {
  unspents.forEach(function(unspent) {
    var txId = unspent.txId

    assert.equal(typeof txId, 'string', 'Expected txId, got ' + txId)
    assert.equal(txId.length, 64, 'Expected valid txId, got ' + txId)
    assert.doesNotThrow(function() {
      bitcoin.Address.fromBase58Check(unspent.address)
    }, 'Expected Base58 Address, got ' + unspent.address)
    assert(isFinite(unspent.confirmations), 'Expected number confirmations, got ' + unspent.confirmations)
    assert(isFinite(unspent.vout), 'Expected number vout, got ' + unspent.vout)
    assert(isFinite(unspent.value), 'Expected number value, got ' + unspent.value)
  })

  this.unspents = unspents
}

Wallet.prototype.signWith = function(tx, addresses, external, internal) {
  external = external || this.external
  internal = internal || this.internal

  var nodes = this.account.getNodes(addresses, external, internal)

  nodes.forEach(function(node, i) {
    tx.sign(i, node.privKey)
  })

  return tx
}

Wallet.prototype.toJSON = function() {
  return {
    external: {
      addresses: this.account.external.addresses,
      map: this.account.external.map,
      node: this.external.toBase58()
    },
    internal: {
      addresses: this.account.internal.addresses,
      map: this.account.internal.map,
      node: this.internal.toBase58()
    },
    k: this.account.k,
    unspents: this.unspents
  }
}

module.exports = Wallet

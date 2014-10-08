var assert = require('assert')

var bitcoinjs = require('bitcoinjs-lib')
var bip32utils = require('bip32-utils')
var networks = bitcoinjs.networks

var Address = bitcoinjs.Address
var HDNode = bitcoinjs.HDNode
var TransactionBuilder = bitcoinjs.TransactionBuilder

var selectInputs = require('./selection')

function Wallet(external, internal) {
  this.account = new bip32utils.Account(external.neutered(), internal.neutered())
  this.network = external.network
  this.unspents = []

  // A closure is used to avoid accidental serialization
  this.getChainNodes = function() {
    return [external, internal]
  }
}

Wallet.fromSeedBuffer = function(seed, network) {
  network = network || networks.bitcoin

  // HD first-level child derivation method should be hardened
  // See https://bitcointalk.org/index.php?topic=405179.msg4415254#msg4415254
  var m = HDNode.fromSeedBuffer(seed, network)
  var i = m.deriveHardened(0)
  var external = i.derive(0)
  var internal = i.derive(1)

  return new Wallet(external, internal, network)
}

Wallet.prototype.createTransaction = function(outputs) {
  // filter un-confirmed
  var unspents = this.unspents.filter(function(unspent) {
    return unspent.confirmations > 0
  })

  var selection = selectInputs(unspents, outputs, this.network)
  var inputs = selection.inputs

  var txb = new TransactionBuilder()
  var addresses = inputs.map(function(input) { return input.address })

  inputs.forEach(function(input) {
    txb.addInput(input.txId, input.vout)
  })

  outputs.forEach(function(output) {
    txb.addOutput(output.address, output.value)
  })

  if (selection.change > this.network.dustThreshold) {
    var changeAddress = this.getChangeAddress()

    txb.addOutput(changeAddress, selection.change)
  }

  // sanity check (until things are battle tested)
  var totalInputValue = inputs.reduce(function(a, x) { return a + x.value }, 0)
  var totalOutputValue = outputs.reduce(function(a, x) { return a + x.value }, 0)
  assert.equal(totalInputValue - totalOutputValue, selection.change + selection.fee)

  // ensure fee isn't crazy (max 0.1 BTC)
  assert(selection.fee < 0.1 * 1e8, 'Very high fee: ' + selection.fee)

  return this.signWith(txb, addresses).build()
}

Wallet.prototype.generateAddress = function() {
  this.account.nextAddress()

  return this.getAddress()
}

Wallet.prototype.getAddress = function() {
  return this.account.getAddress()
}

Wallet.prototype.getAddresses = function() {
  return this.account.addresses
}

Wallet.prototype.getBalance = function() {
  return this.unspents.reduce(function(accum, unspent) {
    return accum + unspent.value
  }, 0)
}

Wallet.prototype.getChangeAddress = function() {
  return this.account.getChangeAddress()
}

Wallet.prototype.getConfirmedBalance = function() {
  return this.unspents.filter(function(unspent) {
    return unspent.confirmations > 0

  }).reduce(function(accum, unspent) {
    return accum + unspent.value
  }, 0)
}

Wallet.prototype.setUnspentOutputs = function(unspents) {
  unspents.forEach(function(unspent) {
    var txId = unspent.txId

    assert.equal(typeof txId, 'string', 'Expected txId, got ' + txId)
    assert.equal(txId.length, 64, 'Expected valid txId, got ' + txId)
    assert.doesNotThrow(function() {
      Address.fromBase58Check(unspent.address)
    }, 'Expected Base58 Address, got ' + unspent.address)
    assert(isFinite(unspent.confirmations), 'Expected number confirmations, got ' + unspent.confirmations)
    assert(isFinite(unspent.vout), 'Expected number vout, got ' + unspent.vout)
    assert(isFinite(unspent.value), 'Expected number value, got ' + unspent.value)
  })

  this.unspents = unspents
}

Wallet.prototype.signWith = function(tx, addresses) {
  var chainNodes = this.getChainNodes()
  var external = chainNodes[0]
  var internal = chainNodes[1]

  var nodes = this.account.getNodes(addresses, external, internal)
  var keys = nodes.map(function(node) { return node.privKey })

  keys.forEach(function(key, i) {
    tx.sign(i, key)
  })

  return tx
}

module.exports = Wallet

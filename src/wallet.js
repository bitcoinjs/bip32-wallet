var assert = require('assert')
var crypto = require('crypto')

var bitcoinjs = require('bitcoinjs-lib')
var bip32utils = require('bip32-utils')
var networks = bitcoinjs.networks

var Address = bitcoinjs.Address
var HDNode = bitcoinjs.HDNode
var TransactionBuilder = bitcoinjs.TransactionBuilder
var Script = bitcoinjs.Script

function Wallet(seed, network) {
  seed = seed || crypto.randomBytes(32)
  network = network || networks.bitcoin

  // HD first-level child derivation method should be hardened
  // See https://bitcointalk.org/index.php?topic=405179.msg4415254#msg4415254
  var m = HDNode.fromSeedBuffer(seed, network)
  var i = m.deriveHardened(0)
  var external = i.derive(0)
  var internal = i.derive(1)

  this.account = new bip32utils.Account(external.neutered(), internal.neutered())
  this.network = network
  this.unspents = []

  // Getters in a closure to avoid accidental serialization
  this.getExternalAccount = function() { return external }
  this.getInternalAccount = function() { return internal }
}

function estimatePaddedFee(tx, network) {
  var tmpTx = tx.clone()
  tmpTx.addOutput(Script.EMPTY, network.dustSoftThreshold || 0)

  return network.estimateFee(tmpTx)
}

Wallet.prototype.createTransaction = function(outputs, options) {
  options = options || {}

  var changeAddress = options.changeAddress
  var fixedFee = options.fixedFee
  var minConf = options.minConf === undefined ? 1 : options.minConf

  // filter by minConf and sort by descending value
  var unspents = this.unspents.filter(function(unspent) {
    return unspent.confirmations >= minConf
  }).sort(function(o1, o2) {
    return o2.value - o1.value
  })

  var txb = new TransactionBuilder()
  var targetValue = 0

  outputs.forEach(function(output) {
    if (output.value <= this.network.dustThreshold) {
      throw new Error(output.value + ' must be above dust threshold (' + this.network.dustThreshold + ' Satoshis)')
    }

    targetValue += output.value
    txb.addOutput(output.address, output.value)
  }, this)

  var accum = 0
  var addresses = []
  var subTotal = targetValue

  for (var i = 0; i < unspents.length; ++i) {
    var unspent = unspents[i]
    addresses.push(unspent.address)

    txb.addInput(unspent.txId, unspent.index)

    var fee
    if (fixedFee === undefined) {
      fee = estimatePaddedFee(txb.buildIncomplete(), this.network)

    } else {
      fee = fixedFee
    }

    accum += unspent.value
    subTotal = targetValue + fee

    if (accum >= subTotal) {
      var change = accum - subTotal

      if (change > this.network.dustThreshold) {
        txb.addOutput(changeAddress || this.getChangeAddress(), change)
      }

      break
    }
  }

  if (accum < subTotal) {
    throw new Error('Not enough funds (incl. fee): ' + accum + ' < ' + subTotal)
  }

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

Wallet.prototype.getBalance = function(minConf) {
  minConf = minConf || 0

  return this.unspents.filter(function(unspent) {
    return unspent.confirmations >= minConf

  }).reduce(function(accum, unspent) {
    return accum + unspent.value
  }, 0)
}

Wallet.prototype.getChangeAddress = function() {
  return this.account.getChangeAddress()
}

Wallet.prototype.getUnspentOutputs = function(minConf) {
  minConf = minConf || 0

  return this.unspents.filter(function(unspent) {
    return unspent.confirmations >= minConf
  })
}

Wallet.prototype.setUnspentOutputs = function(unspents) {
  unspents.forEach(function(unspent) {
    var txId = unspent.txId
    var index = unspent.index

    assert.equal(typeof txId, 'string', 'Expected txId, got ' + txId)
    assert.equal(txId.length, 64, 'Expected valid txId, got ' + txId)
    assert.doesNotThrow(function() {
      Address.fromBase58Check(unspent.address)
    }, 'Expected Base58 Address, got ' + unspent.address)
    assert(isFinite(index), 'Expected number index, got ' + index)
    assert.equal(typeof unspent.value, 'number', 'Expected number value, got ' + unspent.value)
    assert.equal(typeof unspent.confirmations, 'number', 'Expected number confirmations, got ' + unspent.confirmations)
  })

  this.unspents = unspents
}

Wallet.prototype.signWith = function(tx, addresses) {
  var external = this.getExternalAccount()
  var internal = this.getInternalAccount()
  var nodes = this.account.getNodes(addresses, external, internal)
  var keys = nodes.map(function(node) { return node.privKey })

  keys.forEach(function(key, i) {
    tx.sign(i, key)
  })

  return tx
}

module.exports = Wallet

var bip32utils = require('bip32-utils')
var bitcoin = require('bitcoinjs-lib')
var networks = bitcoin.networks
var selectInputs = require('./selection')
var shuffle = require('fisher-yates')
var typeForce = require('typeforce')

function Wallet (external, internal) {
  this.account = new bip32utils.Account(external, internal)
  this.external = external
  this.internal = internal
  this.unspents = []
}

Wallet.fromJSON = function (json) {
  var external = bitcoin.HDNode.fromBase58(json.external.node)
  var internal = bitcoin.HDNode.fromBase58(json.internal.node)
  var wallet = new Wallet(external, internal)
  wallet.account.external.addresses = json.external.addresses
  wallet.account.internal.addresses = json.internal.addresses
  wallet.account.external.map = json.external.map
  wallet.account.internal.map = json.internal.map
  wallet.account.external.k = json.external.k
  wallet.account.internal.k = json.internal.k
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

  // filter un-confirmed
  var unspents = this.unspents.filter(function (unspent) {
    return unspent.confirmations > 0
  })

  var selection = selectInputs(unspents, outputs, network.feePerKb)
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

  // build transaction
  var txb = new bitcoin.TransactionBuilder()

  // shuffle inputs/outputs for privacy
  inputs = shuffle(inputs)
  outputs = shuffle(outputs)

  // add the inputs/outputs
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
  function discoverChain (iterator, callback) {
    bip32utils.discovery(iterator, gapLimit, queryCallback, function (err, used, checked) {
      if (err) return callback(err)

      // throw away ALL unused addresses AFTER the last unused address
      var unused = checked - used
      for (var i = 1; i < unused; ++i) iterator.pop()

      return callback()
    })
  }

  var external = this.account.external
  var internal = this.account.internal

  discoverChain(external, function (err) {
    if (err) return done(err)

    discoverChain(internal, done)
  })
}
Wallet.prototype.getAllAddresses = function () { return this.account.getAllAddresses() }
Wallet.prototype.getBalance = function () {
  return this.unspents.reduce(function (accum, unspent) {
    return accum + unspent.value
  }, 0)
}
Wallet.prototype.getChangeAddress = function () { return this.account.getInternalAddress() }
Wallet.prototype.getConfirmedBalance = function () {
  return this.unspents.filter(function (unspent) {
    return unspent.confirmations > 0

  }).reduce(function (accum, unspent) {
    return accum + unspent.value
  }, 0)
}
Wallet.prototype.getNetwork = function () { return this.account.getNetwork() }
Wallet.prototype.getReceiveAddress = function () { return this.account.getExternalAddress() }
Wallet.prototype.isChangeAddress = function (address) { return this.account.isInternalAddress(address) }
Wallet.prototype.isReceiveAddress = function (address) { return this.account.isExternalAddress(address) }
Wallet.prototype.nextChangeAddress = function () { return this.account.nextInternalAddress() }
Wallet.prototype.nextReceiveAddress = function () { return this.account.nextExternalAddress() }

Wallet.prototype.setUnspentOutputs = function (unspents) {
  var seen = {}

  unspents.forEach(function (unspent) {
    var txId = unspent.txId

    typeForce({
      txId: 'String',
      confirmations: 'Number',
      address: 'String',
      value: 'Number',
      vout: 'Number'
    }, unspent)

    if (txId.length !== 64) {
      throw new TypeError('Expected valid txId, got ' + txId)
    }

    var shortId = txId + ':' + unspent.vout
    if (seen[shortId]) {
      throw new Error('Duplicate unspent ' + shortId)
    }

    seen[shortId] = true

    try {
      bitcoin.Address.fromBase58Check(unspent.address)
    } catch (e) {
      throw new Error('Expected valid base58 Address, got ' + unspent.address)
    }
  })

  this.unspents = unspents
}

Wallet.prototype.signWith = function (tx, addresses, external, internal) {
  external = external || this.external
  internal = internal || this.internal

  var nodes = this.account.getNodes(addresses, external, internal)

  nodes.forEach(function (node, i) {
    tx.sign(i, node.privKey)
  })

  return tx
}

Wallet.prototype.toJSON = function () {
  return {
    external: {
      addresses: this.account.external.addresses,
      map: this.account.external.map,
      k: this.account.external.k,
      node: this.external.toBase58()
    },
    internal: {
      addresses: this.account.internal.addresses,
      map: this.account.internal.map,
      k: this.account.internal.k,
      node: this.internal.toBase58()
    },
    unspents: this.unspents
  }
}

module.exports = Wallet

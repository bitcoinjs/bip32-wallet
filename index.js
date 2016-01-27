var bip32utils = require('bip32-utils')
var bip69 = require('bip69')
var bitcoin = require('bitcoinjs-lib')
var each = require('async-each')

var NETWORKS = bitcoin.networks

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
}

Wallet.fromJSON = function (json, network) {
  function toChain (cjson) {
    var node = bitcoin.HDNode.fromBase58(cjson.node, network)
    var chain = new bip32utils.Chain(node, cjson.k)
    chain.map = cjson.map
    chain.addresses = Object.keys(chain.map).sort(function (a, b) {
      return chain.map[a] - chain.map[b]
    })

    return chain
  }

  var chains
  if (json.chains) {
    chains = json.chains.map(toChain)
  } else if (json.external) {
    chains = [toChain(json.external), toChain(json.internal)]
  }

  return new Wallet(chains)
}

Wallet.fromSeedBuffer = function (seed, network) {
  network = network || NETWORKS.bitcoin

  // HD first-level child derivation method should be hardened
  // See https://bitcointalk.org/index.php?topic=405179.msg4415254#msg4415254
  var m = bitcoin.HDNode.fromSeedBuffer(seed, network)
  var i = m.deriveHardened(0)
  var external = i.derive(0)
  var internal = i.derive(1)

  return new Wallet(external, internal)
}

Wallet.prototype.createTransaction = function (inputs, outputs, wantedFee, external, internal, nLockTime) {
  external = external || this.external
  internal = internal || this.internal
  var network = this.getNetwork()

  // sanity checks
  if (wantedFee > 0.1 * 1e8) throw new Error('Absurd fee: ' + wantedFee)

  var actualInputValue = inputs.reduce(function (a, x) { return a + x.value }, 0)
  var actualOutputValue = outputs.reduce(function (a, x) { return a + x.value }, 0)
  if (actualOutputValue > actualInputValue) throw new Error('Not enough funds: ' + actualInputValue + ' < ' + actualOutputValue)

  var actualOutputValue2 = actualOutputValue + wantedFee
  if (actualOutputValue2 > actualInputValue) throw new Error('Not enough funds: ' + actualInputValue + ' < ' + actualOutputValue2)

  // map outputs to be BIP69 compatible
  outputs = outputs.map(function (output) {
    return {
      script: output.script || bitcoin.address.toOutputScript(output.address, network),
      value: output.value
    }
  })

  var fee
  var remainder = actualInputValue - actualOutputValue - wantedFee

  // is the remainder non-dust?
  if (remainder > network.dustThreshold) {
    outputs.push({
      script: bitcoin.address.toOutputScript(this.getChangeAddress(), network),
      value: remainder
    })

    fee = wantedFee

  // ignore the remainder (include it in the fee)
  } else {
    fee = wantedFee + remainder
    remainder = 0
  }

  // apply BIP69 for improved privacy
  inputs = bip69.sortInputs(inputs)
  outputs = bip69.sortOutputs(outputs)

  // get associated private keys
  var addresses = inputs.map(function (input) { return input.address })
  var children = this.account.getChildren(addresses, [external, internal])

  // build transaction
  var txb = new bitcoin.TransactionBuilder(network)

  // TODO: use txb.setLockTime when merged
  // ref https://github.com/bitcoinjs/bitcoinjs-lib/pull/507
  if (nLockTime !== undefined) {
    txb.tx.locktime = nLockTime
//     txb.setLockTime(nLockTime)
  }

  inputs.forEach(function (input) {
    txb.addInput(input.txId, input.vout, input.sequence, input.prevOutScript)
  })
  outputs.forEach(function (output) {
    txb.addOutput(output.script, output.value)
  })

  // sign and return
  children.forEach(function (child, i) {
    txb.sign(i, child.keyPair)
  })

  return {
    change: remainder,
    fee: fee,
    transaction: txb.build()
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
Wallet.prototype.getNetwork = function () { return this.account.getNetwork() }
Wallet.prototype.getReceiveAddress = function () { return this.account.getChainAddress(0) }
Wallet.prototype.getChangeAddress = function () { return this.account.getChainAddress(1) }
Wallet.prototype.isReceiveAddress = function (address) { return this.account.isChainAddress(0, address) }
Wallet.prototype.isChangeAddress = function (address) { return this.account.isChainAddress(1, address) }
Wallet.prototype.nextReceiveAddress = function () { return this.account.nextChainAddress(0) }
Wallet.prototype.nextChangeAddress = function () { return this.account.nextChainAddress(1) }

Wallet.prototype.toJSON = function () {
  var chains = this.account.chains.map(function (chain) {
    return {
      k: chain.k,
      map: chain.map,
      node: chain.getParent().toBase58()
    }
  })

  return {
    external: chains[0],
    internal: chains[1]
  }
}

module.exports = Wallet

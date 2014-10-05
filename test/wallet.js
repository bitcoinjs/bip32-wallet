var assert = require('assert')

var bitcoinjs = require('bitcoinjs-lib')
var bufferutils = bitcoinjs.bufferutils
var networks = bitcoinjs.networks

var Address = bitcoinjs.Address
var crypto = bitcoinjs.crypto
var HDNode = bitcoinjs.HDNode

var Wallet = require('../src/wallet')

function fakeTxHash(i) {
  var hash = new Buffer(32)
  hash.fill(i)
  return hash
}

function fakeTxId(i) {
  var hash = fakeTxHash(i)
  Array.prototype.reverse.call(hash)
  return hash.toString('hex')
}

describe('Wallet', function() {
  var seed
  beforeEach(function() {
    seed = crypto.sha256("don't use a string seed like this in real life")
  })

  describe('constructor', function() {
    var wallet
    beforeEach(function() {
      wallet = new Wallet(seed)
    })

    it('defaults to Bitcoin network', function() {
      assert.equal(wallet.getMasterKey().network, networks.bitcoin)
    })

    it("generates m/0' as the main account", function() {
      var mainAccount = wallet.getAccountZero()
      assert.equal(mainAccount.index, 0 + HDNode.HIGHEST_BIT)
      assert.equal(mainAccount.depth, 1)
    })

    it("generates m/0'/0 as the external account", function() {
      var account = wallet.getExternalAccount()
      assert.equal(account.index, 0)
      assert.equal(account.depth, 2)
    })

    it("generates m/0'/1 as the internal account", function() {
      var account = wallet.getInternalAccount()
      assert.equal(account.index, 1)
      assert.equal(account.depth, 2)
    })

    describe('when seed is not specified', function() {
      it('generates a seed', function() {
        var wallet = new Wallet()
        assert(wallet.getMasterKey())
      })
    })

    describe('constructor options', function() {
      beforeEach(function() {
        wallet = new Wallet(seed, networks.testnet)
      })

      it('uses the network if specified', function() {
        assert.equal(wallet.getMasterKey().network, networks.testnet)
      })
    })
  })

  describe('generateAddress', function() {
    it('generate receiving addresses', function() {
      var wallet = new Wallet(seed, networks.testnet)
      var expectedAddresses = [
        "n1GyUANZand9Kw6hGSV9837cCC9FFUQzQa",
        "n2fiWrHqD6GM5GiEqkbWAc6aaZQp3ba93X"
      ]

      assert.equal(wallet.getAddress(), expectedAddresses[0])
      assert.equal(wallet.generateAddress(), expectedAddresses[1])
      assert.deepEqual(wallet.account.external.addresses, expectedAddresses)
    })
  })

  describe('Unspent Outputs', function() {
    var utxo
    var wallet

    beforeEach(function() {
      utxo = {
        "address" : "1AZpKpcfCzKDUeTFBQUL4MokQai3m3HMXv",
        "confirmations": 1,
        "index": 0,
        "txId": fakeTxId(6),
        "value": 20000
      }
    })

    describe('on construction', function() {
      beforeEach(function() {
        wallet = new Wallet(seed, networks.bitcoin)
        wallet.setUnspentOutputs([utxo])
      })

      it('matches the expected behaviour', function() {
        var output = wallet.unspents[0]

        assert.equal(output.address, utxo.address)
        assert.equal(output.value, utxo.value)
      })
    })

    describe('getBalance', function() {
      beforeEach(function() {
        var utxo1 = cloneObject(utxo)
        utxo1.hash = fakeTxId(5)

        wallet = new Wallet(seed, networks.bitcoin)
        wallet.setUnspentOutputs([utxo, utxo1])
      })

      it('sums over utxo values', function() {
        assert.equal(wallet.getBalance(), 40000)
      })
    })

    describe('getUnspentOutputs', function() {
      beforeEach(function() {
        wallet = new Wallet(seed, networks.bitcoin)
        wallet.setUnspentOutputs([utxo])
      })

      it('parses wallet unspents to the expected format', function() {
        var outputs = wallet.getUnspentOutputs()
        var output = outputs[0]

        assert.equal(utxo.address, output.address)
        assert.equal(utxo.index, output.index)
        assert.equal(utxo.value, output.value)

        assert.equal(utxo.txId, output.txId)
        assert.equal(utxo.confirmations, output.confirmations)
      })
    })
  })

  describe('setUnspentOutputs', function() {
    var utxo
    var wallet

    beforeEach(function() {
      utxo = {
        txId: fakeTxId(0),
        index: 0,
        address: '115qa7iPZqn6as57hxLL8E9VUnhmGQxKWi',
        value: 500000,
        confirmations: 1
      }

      wallet = new Wallet(seed, networks.bitcoin)
    })

    it('matches the expected behaviour', function() {
      wallet.setUnspentOutputs([utxo])

      var output = wallet.unspents[0]
      assert.equal(output.value, utxo.value)
      assert.equal(output.address, utxo.address)
    })

    describe('required fields', function() {
      ['index', 'address', 'txId', 'value'].forEach(function(field){
        it("throws an error when " + field + " is missing", function() {
          delete utxo[field]

          assert.throws(function() {
            wallet.setUnspentOutputs([utxo])
          })
        })
      })
    })
  })

  describe('createTransaction', function() {
    var wallet
    var address1, address2
    var output

    beforeEach(function() {
      output = {
        address: 'mt7MyTVVEWnbwpF5hBn6fgnJcv95Syk2ue',
        value: 500000
      }

      address1 = "n1GyUANZand9Kw6hGSV9837cCC9FFUQzQa"
      address2 = "n2fiWrHqD6GM5GiEqkbWAc6aaZQp3ba93X"

      // set up 3 utxos
      var utxos = [
        {
          "txId": fakeTxId(1),
          "index": 0,
          "address": address1,
          "value": 400000, // not enough for value
          "confirmations": 1
        },
        {
          "txId": fakeTxId(2),
          "index": 1,
          "address": address1,
          "value": 500000, // enough for only value
          "confirmations": 1
        },
        {
          "txId": fakeTxId(3),
          "index": 0,
          "address" : address2,
          "value": 510000, // enough for value and fee
          "confirmations": 1
        }
      ]

      wallet = new Wallet(seed, networks.testnet)
      wallet.setUnspentOutputs(utxos)
      wallet.generateAddress()
      wallet.generateAddress()
    })

    describe('transaction fee', function() {
      it('allows fee to be specified', function() {
        var fee = 30000
        var tx = wallet.createTransaction([output], { fixedFee: fee })

        assert.equal(getFee(wallet, tx), fee)
      })

      it('allows fee to be set to zero', function() {
        var fee = 0
        var tx = wallet.createTransaction([output], { fixedFee: fee })

        assert.equal(getFee(wallet, tx), fee)
      })

      it('does not overestimate fees when network has dustSoftThreshold', function() {
        var utxo = {
          txId: fakeTxId(0),
          index: 0,
          address: "LeyySKbQrRRwodKEj1W4a8y3YQupPLw5os",
          value: 500000,
          confirmations: 1
        }

        var wallet = new Wallet(seed, networks.litecoin)
        wallet.setUnspentOutputs([utxo])
        wallet.generateAddress()

        var tx = wallet.createTransaction([{
          address: utxo.address,
          value: 200000
        }])

        assert.equal(getFee(wallet, tx), 100000)
      })

      function getFee(wallet, tx) {
        var valueMap = {}
        wallet.unspents.forEach(function(unspent) {
          valueMap[unspent.txId + ':' + unspent.index] = unspent.value
        })

        var inputValue = tx.ins.reduce(function(accum, input) {
          var txId = bufferutils.reverse(input.hash).toString('hex')

          return accum + valueMap[txId + ':' + input.index]
        }, 0)

        return tx.outs.reduce(function(accum, output) {
          return accum - output.value
        }, inputValue)
      }
    })

    describe('choosing utxo', function() {
      it('takes fees into account', function() {
        var tx = wallet.createTransaction([output])

        assert.equal(tx.ins.length, 1)
        assert.deepEqual(tx.ins[0].hash, fakeTxHash(3))
        assert.equal(tx.ins[0].index, 0)
      })

      it('uses only confirmed outputs', function() {
        wallet.setUnspentOutputs([
          {
            "txId": fakeTxId(1),
            "index": 0,
            "address" : address2,
            "value": 531000, // perfect amount w/ fees, but unconfirmed
            "confirmations": 0
          },
          {
            "txId": fakeTxId(3),
            "index": 0,
            "address": address1,
            "value": 300000,
            "confirmations": 1
          },
          {
            "txId": fakeTxId(3),
            "index": 1,
            "address": address2,
            "value": 300000,
            "confirmations": 1
          }
        ])

        var tx = wallet.createTransaction([output], {
          fixedFee: 1000
        })

        assert.equal(tx.ins.length, 2)
        assert.deepEqual(tx.ins[0].hash, fakeTxHash(3))
        assert.deepEqual(tx.ins[1].hash, fakeTxHash(3))
        assert.equal(tx.ins[0].index, 0)
        assert.equal(tx.ins[1].index, 1)
      })
    })

    describe('changeAddress', function() {
      it('should allow custom changeAddress', function() {
        var changeAddress = 'mfrFjnKZUvTcvdAK2fUX5D8v1Epu5H8JCk'
        var fromValue = 510000
        var toValue = fromValue / 2
        var fee = 1e3

        var tx = wallet.createTransaction([{
          address: output.address,
          value: toValue
        }], {
          fixedFee: fee,
          changeAddress: changeAddress
        })
        assert.equal(tx.outs.length, 2)

        var outAddress0 = Address.fromOutputScript(tx.outs[0].script, networks.testnet)
        var outAddress1 = Address.fromOutputScript(tx.outs[1].script, networks.testnet)

        assert.equal(outAddress0.toString(), output.address)
        assert.equal(tx.outs[0].value, toValue)

        assert.equal(outAddress1.toString(), changeAddress)
        assert.equal(tx.outs[1].value, fromValue - (toValue + fee))
      })
    })

    describe('transaction outputs', function() {
      it('includes the specified address and amount', function() {
        var tx = wallet.createTransaction([output])

        assert.equal(tx.outs.length, 1)
        var out = tx.outs[0]
        var outAddress = Address.fromOutputScript(out.script, networks.testnet)

        assert.equal(outAddress.toString(), output.address)
        assert.equal(out.value, output.value)
      })

      describe('change', function() {
        it('uses the last change address if there is any', function() {
          var fee = 0
          wallet.generateAddress()
          var tx = wallet.createTransaction([output], { fixedFee: fee })

          assert.equal(tx.outs.length, 2)
          var out = tx.outs[1]
          var outAddress = Address.fromOutputScript(out.script, networks.testnet)

          assert.equal(outAddress.toString(), wallet.account.internal.addresses[3])
          assert.equal(out.value, 10000)
        })

        it('skips change if it is not above dust threshold', function() {
          var tx1 = wallet.createTransaction([{
            address: output.address,
            value: output.value - 546
          }])
          assert.equal(tx1.outs.length, 1)

          var tx2 = wallet.createTransaction([{
            address: output.address,
            value: output.value - 547
          }])
          assert.equal(tx2.outs.length, 2)
        })
      })
    })

    describe('signing', function() {
      it('signs the inputs with respective keys', function() {
        var fee = 30000
        var tx = wallet.createTransaction([output], { fixedFee: fee })

        assert.equal(tx.getId(), 'a0935ae000b1d7c67d729c64104ae184431a2669e8c080a8b9613a2ff5b5821a')
      })
    })

    describe('when value is below dust threshold', function() {
      it('throws an error', function() {
        var outputs = [{
          address: 'mt7MyTVVEWnbwpF5hBn6fgnJcv95Syk2ue',
          value: 546
        }]

        assert.throws(function() {
          wallet.createTransaction(outputs)
        }, /546 must be above dust threshold \(546 Satoshis\)/)
      })
    })

    describe('when there is not enough money', function() {
      it('throws an error', function() {
        var outputs = [{
          address: 'mt7MyTVVEWnbwpF5hBn6fgnJcv95Syk2ue',
          value: 1400001
        }]

        assert.throws(function() {
          wallet.createTransaction(outputs)
        }, /Not enough funds \(incl. fee\): 1410000 < 1410001/)
      })
    })
  })

  // quick and dirty: does not deal with functions on object
  function cloneObject(obj){
    return JSON.parse(JSON.stringify(obj))
  }
})

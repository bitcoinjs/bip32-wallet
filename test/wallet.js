var assert = require('assert')

var bitcoinjs = require('bitcoinjs-lib')
var networks = bitcoinjs.networks

var Wallet = require('../src/wallet')

function fakeHash(i) {
  return bitcoinjs.crypto.sha256('' + i)
}

function fakeHashHex(i) {
  var hash = fakeHash(i)
  Array.prototype.reverse.call(hash)
  return hash.toString('hex')
}

describe('Wallet', function() {
  var seed
  beforeEach(function() {
    seed = bitcoinjs.crypto.sha256("don't use a string seed like this in real life")
  })

  describe('constructor', function() {
    var wallet
    beforeEach(function() {
      wallet = new Wallet(seed)
    })

    it('defaults to Bitcoin network', function() {
      assert.equal(wallet.network, networks.bitcoin)
    })

    it('uses the network if specified', function() {
      wallet = new Wallet(seed, networks.testnet)

      assert.equal(wallet.network, networks.testnet)
    })

    it("generates m/0'/0 as the external chain node", function() {
      var external = wallet.getExternal()
      assert.equal(external.index, 0)
      assert.equal(external.depth, 2)
    })

    it("generates m/0'/1 as the internal chain node", function() {
      var internal = wallet.getInternal()
      assert.equal(internal.index, 1)
      assert.equal(internal.depth, 2)
    })
  })

  describe('createTransaction', function() {
    var unspents, wallet

    beforeEach(function() {
      unspents = [
        {
          "txId": fakeHashHex(6),
          "blockHash": fakeHashHex(0),
          "blockHeight": 298368,
          "address" : 'n1GyUANZand9Kw6hGSV9837cCC9FFUQzQa',
          "vout": 0,
          "value": 20000
        },
        {
          "txId": fakeHashHex(7),
          "blockHash": fakeHashHex(0),
          "blockHeight": 298368,
          "address" : 'n2fiWrHqD6GM5GiEqkbWAc6aaZQp3ba93X',
          "vout": 1,
          "value": 30000
        },
        {
          "txId": fakeHashHex(8),
          "blockHash": null,
          "blockHeight": null,
          "address" : 'n1GyUANZand9Kw6hGSV9837cCC9FFUQzQa',
          "vout": 0,
          "value": 6000
        }
      ]

      wallet = new Wallet(seed, networks.testnet)
    })
  })

  describe('generateAddress', function() {
    var wallet

    beforeEach(function() {
      wallet = new Wallet(seed, networks.testnet)
    })

    it('generates a new external (and internal) Address', function() {
      assert.deepEqual(wallet.getAddresses(), [
        "n1GyUANZand9Kw6hGSV9837cCC9FFUQzQa",
        "mnXiDR4MKsFxcKJEZjx4353oXvo55iuptn"
      ])

      wallet.generateAddress()

      assert.deepEqual(wallet.getAddresses(), [
        'n1GyUANZand9Kw6hGSV9837cCC9FFUQzQa',
        'n2fiWrHqD6GM5GiEqkbWAc6aaZQp3ba93X',
        'mnXiDR4MKsFxcKJEZjx4353oXvo55iuptn',
        'mtQrg4dcAVhDDzbyXawmRbpzRTRiUgfAE5'
      ])
    })

    it('returns the latest external Address', function() {
      var result = wallet.generateAddress()

      assert.deepEqual(result, wallet.getAddress())
    })
  })

  describe.skip('getAddress', function() {})
  describe('getAddresses', function() {
    var wallet

    beforeEach(function() {
      wallet = new Wallet(seed, networks.testnet)
    })

    it('returns all known addresses', function() {
      wallet.generateAddress()

      assert.deepEqual(wallet.getAddresses(), [
        'n1GyUANZand9Kw6hGSV9837cCC9FFUQzQa',
        'n2fiWrHqD6GM5GiEqkbWAc6aaZQp3ba93X',
        'mnXiDR4MKsFxcKJEZjx4353oXvo55iuptn',
        'mtQrg4dcAVhDDzbyXawmRbpzRTRiUgfAE5'
      ])
    })
  })

  describe('getBalance', function() {
    var unspents, wallet

    beforeEach(function() {
      unspents = [
        {
          "txId": fakeHashHex(6),
          "blockHash": fakeHashHex(0),
          "blockHeight": 298368,
          "address" : 'n1GyUANZand9Kw6hGSV9837cCC9FFUQzQa',
          "vout": 0,
          "value": 20000
        },
        {
          "txId": fakeHashHex(7),
          "blockHash": fakeHashHex(0),
          "blockHeight": 298368,
          "address" : 'n2fiWrHqD6GM5GiEqkbWAc6aaZQp3ba93X',
          "vout": 1,
          "value": 30000
        },
        {
          "txId": fakeHashHex(8),
          "blockHash": null,
          "blockHeight": null,
          "address" : 'n1GyUANZand9Kw6hGSV9837cCC9FFUQzQa',
          "vout": 0,
          "value": 6000
        }
      ]

      wallet = new Wallet(seed)
      wallet.setUnspentOutputs(unspents)
    })

    it('sums all unspents', function() {
      assert.equal(wallet.getBalance(), 56000)
    })
  })

  describe.skip('getChangeAddress', function() {})

  describe('getConfirmedBalance', function() {
    var unspents, wallet

    beforeEach(function() {
      unspents = [
        {
          "txId": fakeHashHex(6),
          "blockHash": fakeHashHex(0),
          "blockHeight": 298368,
          "address" : 'n1GyUANZand9Kw6hGSV9837cCC9FFUQzQa',
          "vout": 0,
          "value": 20000
        },
        {
          "txId": fakeHashHex(7),
          "blockHash": fakeHashHex(0),
          "blockHeight": 298368,
          "address" : 'n2fiWrHqD6GM5GiEqkbWAc6aaZQp3ba93X',
          "vout": 1,
          "value": 30000
        },
        {
          "txId": fakeHashHex(8),
          "blockHash": null,
          "blockHeight": null,
          "address" : 'n1GyUANZand9Kw6hGSV9837cCC9FFUQzQa',
          "vout": 0,
          "value": 6000
        }
      ]

      wallet = new Wallet(seed)
      wallet.setUnspentOutputs(unspents)
    })

    it('sums confirmed unspents', function() {
      assert.equal(wallet.getConfirmedBalance(), 50000)
    })
  })

  describe('setUnspentOutputs', function() {
    var unspents, wallet

    beforeEach(function() {
      unspents = [
        {
          "txId": fakeHashHex(6),
          "blockHash": fakeHashHex(0),
          "blockHeight": 298368,
          "address" : 'n1GyUANZand9Kw6hGSV9837cCC9FFUQzQa',
          "vout": 0,
          "value": 20000
        },
        {
          "txId": fakeHashHex(7),
          "blockHash": fakeHashHex(0),
          "blockHeight": 298368,
          "address" : 'n2fiWrHqD6GM5GiEqkbWAc6aaZQp3ba93X',
          "vout": 1,
          "value": 30000
        },
        {
          "txId": fakeHashHex(8),
          "blockHash": null,
          "blockHeight": null,
          "address" : 'n1GyUANZand9Kw6hGSV9837cCC9FFUQzQa',
          "vout": 0,
          "value": 6000
        }
      ]

      wallet = new Wallet(seed)
    })

    it('sets wallet.unspents correctly', function() {
      wallet.setUnspentOutputs(unspents)

      assert.equal(wallet.unspents, unspents)
    })

    // TODO: test validation
  })

  describe.skip('signWith', function() {})
})

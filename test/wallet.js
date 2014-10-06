var assert = require('assert')
var bitcoinjs = require('bitcoinjs-lib')

var Wallet = require('../src/wallet')

var fixtures = require('./fixtures/wallet.json')

describe('Wallet', function() {
  var f, wallet

  beforeEach(function() {
    f = fixtures.valid[0]

    var seed = new Buffer(f.seed, 'hex')
    var network = bitcoinjs.networks[f.network]
    wallet = new Wallet(seed, network)
  })

  describe('constructor', function() {
    it('defaults to Bitcoin network', function() {
      var defaulted = new Wallet(new Buffer(32))

      assert.equal(defaulted.network, bitcoinjs.networks.bitcoin)
    })

    it('uses the network if specified', function() {
      var expected = bitcoinjs.networks[f.network]

      assert.equal(wallet.network, expected)
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

  describe.skip('createTransaction', function() {})

  describe('generateAddress', function() {
    it('generates a new external (and internal) Address', function() {
      assert.deepEqual(wallet.getAddresses(), [
        f.addresses[0],
        f.addresses[f.addresses.length / 2]
      ])

      wallet.generateAddress()

      assert.deepEqual(wallet.getAddresses(), f.addresses.slice(0, 4))
    })

    it('returns the latest external Address', function() {
      var result = wallet.generateAddress()

      assert.deepEqual(result, wallet.getAddress())
    })
  })

  describe.skip('getAddress', function() {})
  describe('getAddresses', function() {
    it.only('returns all known addresses', function() {
      for (var i = 2; i < f.addresses.length; i += 2) {
        wallet.generateAddress()
      }

      assert.deepEqual(wallet.getAddresses(), f.addresses)
    })
  })

  describe('getBalance', function() {
    beforeEach(function() {
      wallet.setUnspentOutputs(f.unspents)
    })

    it('sums all unspents', function() {
      assert.equal(wallet.getBalance(), 56000) // FIXME: move balance to fixtures
    })
  })

  describe.skip('getChangeAddress', function() {})

  describe('getConfirmedBalance', function() {
    beforeEach(function() {
      wallet.setUnspentOutputs(f.unspents)
    })

    it('sums confirmed unspents', function() {
      assert.equal(wallet.getConfirmedBalance(), 50000) // FIXME: move balance to fixtures
    })
  })

  describe('setUnspentOutputs', function() {
    it('sets wallet.unspents correctly', function() {
      wallet.setUnspentOutputs(f.unspents)

      assert.equal(wallet.unspents, f.unspents)
    })

    // TODO: test validation
  })

  describe.skip('signWith', function() {})
})

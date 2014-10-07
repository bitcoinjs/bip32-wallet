var assert = require('assert')
var bitcoinjs = require('bitcoinjs-lib')

var Wallet = require('../src/wallet')

var fixtures = require('./fixtures/wallet.json')

describe('Wallet', function() {
  describe('constructor', function() {
    var seed, wallet

    beforeEach(function() {
      seed = new Buffer(32)
      wallet = new Wallet(seed)
    })

    it('defaults to Bitcoin network', function() {
      assert.equal(wallet.network, bitcoinjs.networks.bitcoin)
    })

    it('uses the network if specified', function() {
      wallet = new Wallet(seed, bitcoinjs.networks.testnet)

      assert.equal(wallet.network, bitcoinjs.networks.testnet)
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

  fixtures.valid.forEach(function(f, i) {
    if (i === 0) return
    var wallet

    beforeEach(function() {
      var seed = new Buffer(f.seed, 'hex')
      var network = bitcoinjs.networks[f.network]

      wallet = new Wallet(seed, network)
    })

    describe.skip('createTransaction', function() {

    })

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
      it('returns all known addresses', function() {
        for (var i = 2; i < f.addresses.length; i += 2) {
          wallet.generateAddress()
        }

        assert.deepEqual(wallet.getAddresses(), f.addresses)
      })
    })

//it('skips change if it is not above dust threshold', function() {
//it('signs the inputs with respective keys', function() {
//it('throws when value is below dust threshold', function() {
//it('throws there is not enough money', function() {
//it('throws there is not enough money (incl. fee)', function() {

    describe('getBalance', function() {
      beforeEach(function() {
        wallet.setUnspentOutputs(f.unspents)
      })

      it('sums all unspents', function() {
        assert.equal(wallet.getBalance(), f.balance)
      })
    })

    describe.skip('getChangeAddress', function() {

    })

    describe('getConfirmedBalance', function() {
      beforeEach(function() {
        wallet.setUnspentOutputs(f.unspents)
      })

      it('sums confirmed unspents', function() {
        assert.equal(wallet.getConfirmedBalance(), f.confirmedBalance)
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
})

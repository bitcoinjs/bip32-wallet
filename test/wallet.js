var assert = require('assert')
var bitcoinjs = require('bitcoinjs-lib')

var Wallet = require('../src/wallet')

var fixtures = require('./fixtures/wallet.json')

describe('Wallet', function() {
  describe('constructor', function() {
    var external, internal, wallet

    beforeEach(function() {
      var seed = new Buffer(32)
      var m = bitcoinjs.HDNode.fromSeedBuffer(seed)

      external = m.derive(0)
      internal = m.derive(1)

      wallet = new Wallet(external, internal)
    })

    it('uses the external nodes network', function() {
      assert.equal(external.network, bitcoinjs.networks.bitcoin)
    })
  })

  describe('fromSeedBuffer', function() {
    var seed, wallet

    beforeEach(function() {
      seed = new Buffer(32)
      wallet = Wallet.fromSeedBuffer(seed)
    })

    it('defaults to Bitcoin network', function() {
      assert.equal(wallet.network, bitcoinjs.networks.bitcoin)
    })

    it('uses the network if specified', function() {
      wallet = Wallet.fromSeedBuffer(seed, bitcoinjs.networks.testnet)

      assert.equal(wallet.network, bitcoinjs.networks.testnet)
    })

    it("generates m/0'/0 as the external chain node", function() {
      var external = wallet.getChainNodes()[0]
      assert.equal(external.index, 0)
      assert.equal(external.depth, 2)
    })

    it("generates m/0'/1 as the internal chain node", function() {
      var internal = wallet.getChainNodes()[1]
      assert.equal(internal.index, 1)
      assert.equal(internal.depth, 2)
    })
  })

  fixtures.valid.forEach(function(f, i) {
    describe('Test fixture ' + i, function() {
      var wallet

      beforeEach(function() {
        var seed = new Buffer(f.seed, 'hex')
        var network = bitcoinjs.networks[f.network]

        wallet = Wallet.fromSeedBuffer(seed, network)
      })

      // TODO
      //it('throws when value is below dust threshold', function() {
      //it('throws there is not enough money', function() {
      //it('throws there is not enough money (incl. fee)', function() {
      describe('createTransaction', function() {
        beforeEach(function() {
          for (var i = 2; i < f.addresses.length; i += 2) {
            wallet.generateAddress()
          }

          wallet.setUnspentOutputs(f.unspents)
        })

        f.transactions.forEach(function(t) {
          it(t.description, function() {
            var tx = wallet.createTransaction(t.outputs, t.options)
            var totalInputValue = 0

            // ensure all expected inputs are found (and sum input values)
            t.expected.inputs.forEach(function(index) {
              var unspent = f.unspents[index]

              totalInputValue += unspent.value

              assert(tx.ins.some(function(txIn) {
                var txId = bitcoinjs.bufferutils.reverse(txIn.hash).toString('hex')

                return unspent.txId === txId && unspent.vout === txIn.index
              }))
            })

            // ensure no other inputs exist
            assert.equal(tx.ins.length, t.expected.inputs.length)

            // ensure all expected outputs are found
            t.outputs.forEach(function(output) {
              assert(tx.outs.some(function(txOut) {
                var address = bitcoinjs.Address.fromOutputScript(txOut.script, wallet.network).toString()

                return output.address === address && output.value === txOut.value
              }))
            })

            // ensure no other outputs exist (unless change is expected)
            assert.equal(tx.outs.length, t.outputs.length + !!t.expected.change)

            // enforce the change address is as expected
            if (tx.outs.length > t.outputs.length) {
              var changeAddress = wallet.getChangeAddress()

              assert(tx.outs.some(function(txOut) {
                var address = bitcoinjs.Address.fromOutputScript(txOut.script, wallet.network).toString()

                return changeAddress === address
              }))
            }

            // validate total input/output values
            var totalOutputValue = tx.outs.reduce(function(a, x) { return a + x.value }, 0)

            var expectedOutputValue = t.outputs.reduce(function(a, x) { return a + x.value }, 0)
            var change = totalOutputValue - expectedOutputValue
            var fee = totalInputValue - totalOutputValue

            assert.equal(change, t.expected.change)
            assert.equal(fee, t.expected.fee)

            // catch-all verification
            assert.equal(tx.getId(), t.expected.txId)
          })
        })
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

      describe('getAddress', function() {
        it('returns the latest internal Address', function() {
          var expected = wallet.account.external.get()

          assert.deepEqual(wallet.getAddress(), expected)
        })
      })

      describe('getAddresses', function() {
        it('returns all known addresses', function() {
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
          assert.equal(wallet.getBalance(), f.balance)
        })
      })

      describe('getChangeAddress', function() {
        it('returns the latest internal Address', function() {
          var expected = wallet.account.internal.get()

          assert.deepEqual(wallet.getChangeAddress(), expected)
        })
      })

      describe('getConfirmedBalance', function() {
        beforeEach(function() {
          wallet.setUnspentOutputs(f.unspents)
        })

        it('sums confirmed unspents', function() {
          assert.equal(wallet.getConfirmedBalance(), f.confirmedBalance)
        })
      })

      describe('ownsAddress', function() {
        beforeEach(function() {
          for (var i = 2; i < f.addresses.length; i += 2) {
            wallet.generateAddress()
          }
        })

        it('returns true for known addresses', function() {
          f.addresses.forEach(function(address) {
            assert(wallet.ownsAddress(address))
          })
        })

        it('returns false for unknown addresses', function() {
          assert(!wallet.ownsAddress('1MsHWS1BnwMc3tLE8G35UXsS58fKipzB7a'))
        })
      })

      describe('setUnspentOutputs', function() {
        it('sets wallet.unspents correctly', function() {
          wallet.setUnspentOutputs(f.unspents)

          assert.equal(wallet.unspents, f.unspents)
        })

        // TODO: test validation
      })

      describe('signWith', function() {
        beforeEach(function() {
          for (var i = 2; i < f.addresses.length; i += 2) {
            wallet.generateAddress()
          }
        })

        it('signs Transaction inputs with respective keys', function() {
          var txb = new bitcoinjs.TransactionBuilder()

          f.unspents.forEach(function(unspent) {
            txb.addInput(unspent.txId, unspent.vout)
          })

          txb.addOutput(wallet.getAddress(), 1e5)

          var addresses = f.unspents.map(function(unspent) { return unspent.address })
          var tx = wallet.signWith(txb, addresses).build()

          addresses.forEach(function(address, i) {
            var input = tx.ins[i]
            var pubKey = bitcoinjs.ECPubKey.fromBuffer(input.script.chunks[1])

            assert.equal(pubKey.getAddress(wallet.network).toString(), address)
          })
        })
      })
    })
  })
})

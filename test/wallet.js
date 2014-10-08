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
    describe('Test fixture ' + i, function() {
      var wallet

      beforeEach(function() {
        var seed = new Buffer(f.seed, 'hex')
        var network = bitcoinjs.networks[f.network]

        wallet = new Wallet(seed, network)
      })

      // TODO
      //it('throws when value is below dust threshold', function() {
      //it('throws there is not enough money', function() {
      //it('throws there is not enough money (incl. fee)', function() {
      describe('createTransaction', function() {
        var unspentsMap

        beforeEach(function() {
          for (var i = 2; i < f.addresses.length; i += 2) {
            wallet.generateAddress()
          }

          wallet.setUnspentOutputs(f.unspents)

          unspentsMap = {}
          f.unspents.forEach(function(unspent) {
            unspentsMap[unspent.txId + ':' + unspent.vout] = unspent
          })
        })

        f.transactions.forEach(function(t) {
          it(t.description, function() {
            var tx = wallet.createTransaction(t.outputs, t.options)

            var inputTotal = 0
            tx.ins.forEach(function(txIn) {
              var txId = bitcoinjs.bufferutils.reverse(txIn.hash).toString('hex')
              var unspent = unspentsMap[txId + ':' + txIn.index]
              inputTotal += unspent.value
            })

            var expectedTotal = t.outputs.reduce(function(a, x) { return a + x.value }, 0)
            var outputTotal = tx.outs.reduce(function(a, x) { return a + x.value }, 0)
            var fee = inputTotal - outputTotal
            var change = outputTotal - expectedTotal

            assert.equal(change, t.expected.change)
            assert.equal(fee, t.expected.fee)

            // if change is expected, make sure outputs length matches
            assert.equal(tx.outs.length, t.outputs.length + !!t.expected.change)

            // ensure only expected inputs are found
            t.expected.inputs.forEach(function(index) {
              var unspent = f.unspents[index]

              assert(tx.ins.some(function(txIn) {
                var txId = bitcoinjs.bufferutils.reverse(txIn.hash).toString('hex')

                return unspent.txId === txId && unspent.vout === txIn.index
              }))
            })

            // ensure only expected outputs are found
            t.outputs.forEach(function(output) {
              assert(tx.outs.some(function(txOut) {
                var address = bitcoinjs.Address.fromOutputScript(txOut.script, wallet.network).toString()

                return output.address === address && output.value === txOut.value
              }))
            })

            if (t.options.changeAddress) {
              assert(tx.outs.some(function(txOut) {
                var address = bitcoinjs.Address.fromOutputScript(txOut.script, wallet.network).toString()

                return t.options.changeAddress === address
              }))
            }

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

      describe('setUnspentOutputs', function() {
        it('sets wallet.unspents correctly', function() {
          wallet.setUnspentOutputs(f.unspents)

          assert.equal(wallet.unspents, f.unspents)
        })

        // TODO: test validation
      })

      describe('signWith', function() {
        it('signs Transaction inputs with respective keys', function() {
          var addresses = wallet.getAddresses()
          var hash = new Buffer(32)
          hash.fill(1)

          var txb = new bitcoinjs.TransactionBuilder()

          addresses.forEach(function(address, i) {
            txb.addInput(hash, i)
          })

          wallet.generateAddress()
          txb.addOutput(wallet.getChangeAddress(), 1e5)

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

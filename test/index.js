/* global beforeEach, describe, it */

var assert = require('assert')
var bip32utils = require('bip32-utils')
var bitcoin = require('bitcoinjs-lib')
var sinon = require('sinon')

var Wallet = require('../src/index')

var fixtures = require('./fixtures/index.json')

describe('Wallet', function () {
  describe('fromSeedBuffer', function () {
    var seed, wallet

    beforeEach(function () {
      seed = new Buffer(32)
      wallet = Wallet.fromSeedBuffer(seed)
    })

    it('defaults to Bitcoin network', function () {
      assert.equal(wallet.getNetwork(), bitcoin.networks.bitcoin)
    })

    it('uses the network if specified', function () {
      wallet = Wallet.fromSeedBuffer(seed, bitcoin.networks.testnet)

      assert.equal(wallet.getNetwork(), bitcoin.networks.testnet)
    })

    it("generates m/0'/0 as the external chain node", function () {
      assert.equal(wallet.external.index, 0)
      assert.equal(wallet.external.depth, 2)
    })

    it("generates m/0'/1 as the internal chain node", function () {
      assert.equal(wallet.internal.index, 1)
      assert.equal(wallet.internal.depth, 2)
    })
  })

  fixtures.valid.forEach(function (f, i) {
    describe('Test fixture ' + i, function () {
      var wallet

      beforeEach(function () {
        wallet = Wallet.fromJSON(f.json)
      })

      describe('fromJSON', function () {
        it('imports from a JSON object correctly', function () {
          assert.equal(wallet.account.external.addresses, f.json.external.addresses)
          assert.equal(wallet.account.internal.addresses, f.json.internal.addresses)
          assert.equal(wallet.account.external.map, f.json.external.map)
          assert.equal(wallet.account.internal.map, f.json.internal.map)
          assert.equal(wallet.unspents, f.json.unspents)
        })
      })

      describe('containsAddress', function () {
        it('wraps account.containsAddress', sinon.test(function () {
          var address = wallet.getReceiveAddress()

          this.mock(wallet.account).expects('containsAddress')
            .once().calledWith(address)

          wallet.containsAddress(address)
        }))

        it('returns the expected results', function () {
          f.json.external.addresses.forEach(function (address) {
            assert(wallet.containsAddress(address))
          })

          f.json.internal.addresses.forEach(function (address) {
            assert(wallet.containsAddress(address))
          })

          assert(!wallet.containsAddress('1MsHWS1BnwMc3tLE8G35UXsS58fKipzB7a'))
        })
      })

      describe('createTransaction', function () {
        f.transactions.forEach(function (t) {
          it(t.description, function () {
            var formed = wallet.createTransaction(t.outputs, t.options)
            var tx = formed.transaction
            var totalInputValue = 0

            // ensure all expected inputs are found (and sum input values)
            t.expected.inputs.forEach(function (index) {
              var unspent = f.json.unspents[index]

              totalInputValue += unspent.value

              assert(tx.ins.some(function (txIn) {
                var txId = bitcoin.bufferutils.reverse(txIn.hash).toString('hex')

                return unspent.txId === txId && unspent.vout === txIn.index
              }))
            })

            // ensure no other inputs exist
            assert.equal(tx.ins.length, t.expected.inputs.length)

            var network = wallet.getNetwork()

            // ensure all expected outputs are found
            t.outputs.forEach(function (output) {
              assert(tx.outs.some(function (txOut) {
                var address = bitcoin.Address.fromOutputScript(txOut.script, network).toString()

                return output.address === address && output.value === txOut.value
              }))
            })

            // ensure no other outputs exist (unless change is expected)
            assert.equal(tx.outs.length, t.outputs.length + !!t.expected.change)

            // enforce the change address is as expected
            if (tx.outs.length > t.outputs.length) {
              var changeAddress = wallet.getChangeAddress()

              assert(tx.outs.some(function (txOut) {
                var address = bitcoin.Address.fromOutputScript(txOut.script, network).toString()

                return changeAddress === address
              }))
            }

            // validate total input/output values
            var totalOutputValue = tx.outs.reduce(function (a, x) { return a + x.value }, 0)

            var expectedOutputValue = t.outputs.reduce(function (a, x) { return a + x.value }, 0)
            var actualChange = totalOutputValue - expectedOutputValue
            var actualFee = totalInputValue - totalOutputValue

            assert.equal(actualChange, formed.change)
            assert.equal(actualChange, t.expected.change)
            assert.equal(actualFee, formed.fee)
            assert.equal(actualFee, t.expected.fee)

            // catch-all verification
            assert.equal(tx.getId(), t.expected.txId)
          })
        })

        // TODO: it('throws when value is below dust threshold', function () {})
      })

      describe('discover', function () {
        it('wraps bip32utils.discovery', sinon.test(function () {
          var gapLimit = 2
          var query = function () {}
          var callback = function () {}

          var mock = this.mock(bip32utils).expects('discovery')
          mock.calledWithExactly(wallet.account.external, gapLimit, query, callback)
          mock.calledWithExactly(wallet.account.internal, gapLimit, query, callback)
          mock.twice()

          wallet.discover(gapLimit, query, callback)
          mock.callArgWith(3, null, 0, 1)
        }))

        it('accounts each retain used addresses and ONE unused address', sinon.test(function () {
          var i = 0
          var results = [
            // external
            true, true, true, false, false, false,

            // internal
            true, true, false, false
          ]

          var query = function (a, callback) {
            i += a.length
            return callback(null, results.slice(i - a.length, i))
          }

          wallet.discover(2, query, function (err) {
            assert.ifError(err)
            assert.equal(wallet.account.external.k, 3)
            assert.equal(wallet.account.internal.k, 2)
          })
        }))
      })

      describe('getAllAddresses', function () {
        it('wraps account.getAllAddresses', sinon.test(function () {
          this.mock(wallet.account).expects('getAllAddresses').once()
          wallet.getAllAddresses()
        }))

        it('returns all known addresses', function () {
          var addresses = f.json.external.addresses.concat(f.json.internal.addresses)

          assert.deepEqual(wallet.getAllAddresses(), addresses)
        })
      })

      describe('getBalance', function () {
        beforeEach(function () {
          wallet.setUnspentOutputs(f.json.unspents)
        })

        it('sums all unspents', function () {
          assert.equal(wallet.getBalance(), f.balance)
        })
      })

      describe('getChangeAddress', function () {
        it('wraps account.getChangeAddress', sinon.test(function () {
          this.mock(wallet.account).expects('getInternalAddress').once()
          wallet.getChangeAddress()
        }))

        it('returns the current internal Address', function () {
          wallet.nextChangeAddress()

          assert.equal(wallet.getChangeAddress(), wallet.account.internal.get())
        })
      })

      describe('getConfirmedBalance', function () {
        beforeEach(function () {
          wallet.setUnspentOutputs(f.json.unspents)
        })

        it('sums confirmed unspents', function () {
          assert.equal(wallet.getConfirmedBalance(), f.confirmedBalance)
        })
      })

      describe('getNetwork', function () {
        it('wraps account.getNetwork', sinon.test(function () {
          this.mock(wallet.account).expects('getNetwork').once()
          wallet.getNetwork()
        }))

        it('returns the accounts network', function () {
          assert.equal(wallet.getNetwork(), wallet.account.getNetwork())
        })
      })

      describe('getReceiveAddress', function () {
        it('wraps account.getExternalAddress', sinon.test(function () {
          this.mock(wallet.account).expects('getExternalAddress').once()
          wallet.getReceiveAddress()
        }))

        it('returns the current external Address', function () {
          wallet.nextReceiveAddress()

          assert.equal(wallet.getReceiveAddress(), wallet.account.external.get())
        })
      })

      describe('isReceiveAddress', function () {
        it('wraps account.isExternalAddress', sinon.test(function () {
          this.mock(wallet.account).expects('isExternalAddress').once()
          wallet.isReceiveAddress()
        }))

        it('returns true for a valid receive address', function () {
          assert(wallet.isReceiveAddress(wallet.getReceiveAddress()))
        })
      })

      describe('isChangeAddress', function () {
        it('wraps account.isInternalAddress', sinon.test(function () {
          this.mock(wallet.account).expects('isInternalAddress').once()
          wallet.isChangeAddress()
        }))

        it('returns true for a valid change address', function () {
          assert(wallet.isChangeAddress(wallet.getChangeAddress()))
        })
      })

      describe('nextChangeAddress', function () {
        it('wraps account.nextInternalAddress', sinon.test(function () {
          this.mock(wallet.account).expects('nextInternalAddress').once()
          wallet.nextChangeAddress()
        }))

        it('returns the new change Address', function () {
          var result = wallet.nextChangeAddress()

          assert.equal(result, wallet.getChangeAddress())
        })
      })

      describe('nextReceiveAddress', function () {
        it('wraps account.nextExternalAddress', sinon.test(function () {
          this.mock(wallet.account).expects('nextExternalAddress').once()
          wallet.nextReceiveAddress()
        }))

        it('returns the new receive Address', function () {
          var result = wallet.nextReceiveAddress()

          assert.equal(result, wallet.getReceiveAddress())
        })
      })

      describe('setUnspentOutputs', function () {
        it('sets wallet.unspents correctly', function () {
          wallet.setUnspentOutputs(f.json.unspents)

          assert.equal(wallet.unspents, f.json.unspents)
        })
      })

      describe('signWith', function () {
        it('signs Transaction inputs with respective keys', function () {
          var txb = new bitcoin.TransactionBuilder()

          f.json.unspents.forEach(function (unspent) {
            txb.addInput(unspent.txId, unspent.vout)
          })

          txb.addOutput(wallet.getReceiveAddress(), 1e5)

          var addresses = f.json.unspents.map(function (unspent) { return unspent.address })
          var tx = wallet.signWith(txb, addresses).build()
          var network = wallet.getNetwork()

          addresses.forEach(function (address, i) {
            var input = tx.ins[i]
            var pubKey = bitcoin.ECPubKey.fromBuffer(input.script.chunks[1])

            assert.equal(pubKey.getAddress(network).toString(), address)
          })
        })
      })

      describe('toJSON', function () {
        it('exports a JSON object correctly', function () {
          assert.deepEqual(wallet.toJSON(), f.json)
        })
      })
    })
  })

  fixtures.invalid.setUnspentOutputs.forEach(function (f) {
    describe('setUnspentOutputs', function () {
      var wallet

      beforeEach(function () {
        var seed = new Buffer(32)
        wallet = Wallet.fromSeedBuffer(seed)
      })

      it('throws "' + f.exception + '" when necessary', function () {
        assert.throws(function () {
          wallet.setUnspentOutputs(f.unspents)
        }, new RegExp(f.exception))
      })
    })
  })
})

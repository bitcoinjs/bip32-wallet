var assert = require('assert')
var bitcoin = require('bitcoinjs-lib')
var sinon = require('sinon')

var Wallet = require('../src/wallet')

var fixtures = require('./fixtures/wallet.json')

describe('Wallet', function() {
  describe('constructor', function() {
    var external, wallet

    beforeEach(function() {
      var seed = new Buffer(32)
      var m = bitcoin.HDNode.fromSeedBuffer(seed, bitcoin.networks.litecoin)

      external = m.derive(0).neutered()
      var internal = m.derive(1).neutered()

      wallet = new Wallet(external, internal)
    })

    it('uses the external nodes network', function() {
      assert.equal(external.network, bitcoin.networks.litecoin)
    })
  })

  describe('fromSeedBuffer', function() {
    var seed, wallet

    beforeEach(function() {
      seed = new Buffer(32)
      wallet = Wallet.fromSeedBuffer(seed)
    })

    it('defaults to Bitcoin network', function() {
      assert.equal(wallet.network, bitcoin.networks.bitcoin)
    })

    it('uses the network if specified', function() {
      wallet = Wallet.fromSeedBuffer(seed, bitcoin.networks.testnet)

      assert.equal(wallet.network, bitcoin.networks.testnet)
    })

    it("generates m/0'/0 as the external chain node", function() {
      var external = wallet.account.external.hdNode
      assert.equal(external.index, 0)
      assert.equal(external.depth, 2)
    })

    it("generates m/0'/1 as the internal chain node", function() {
      var internal = wallet.account.internal.hdNode
      assert.equal(internal.index, 1)
      assert.equal(internal.depth, 2)
    })
  })

  fixtures.valid.forEach(function(f, i) {
    describe('Test fixture ' + i, function() {
      var wallet

      beforeEach(function() {
        wallet = Wallet.fromJSON(f.json)
      })

      describe('fromJSON', function() {
        it('imports from a JSON object correctly', function() {
          assert.equal(wallet.account.external.addresses, f.json.external.addresses)
          assert.equal(wallet.account.internal.addresses, f.json.internal.addresses)
          assert.equal(wallet.account.external.map, f.json.external.map)
          assert.equal(wallet.account.internal.map, f.json.internal.map)
          assert.equal(wallet.account.k, f.json.k)
          assert.equal(wallet.unspents, f.json.unspents)
        })
      })

      describe('containsAddress', function() {
        it('wraps account.containsAddress', sinon.test(function() {
          var address = wallet.getReceiveAddress()

          this.mock(wallet.account).expects('containsAddress')
            .once().calledWith(address)

          wallet.containsAddress(address)
        }))

        it('returns the expected results', function() {
          f.json.external.addresses.forEach(function(address) {
            assert(wallet.containsAddress(address))
          })

          f.json.internal.addresses.forEach(function(address) {
            assert(wallet.containsAddress(address))
          })

          assert(!wallet.containsAddress('1MsHWS1BnwMc3tLE8G35UXsS58fKipzB7a'))
        })
      })

      // TODO
      //it'throws when value is below dust threshold', function() {})
      describe('createTransaction', function() {
        f.transactions.forEach(function(t) {
          it(t.description, function() {
            var tx = wallet.createTransaction(t.outputs, t.options)
            var totalInputValue = 0

            // ensure all expected inputs are found (and sum input values)
            t.expected.inputs.forEach(function(index) {
              var unspent = f.json.unspents[index]

              totalInputValue += unspent.value

              assert(tx.ins.some(function(txIn) {
                var txId = bitcoin.bufferutils.reverse(txIn.hash).toString('hex')

                return unspent.txId === txId && unspent.vout === txIn.index
              }))
            })

            // ensure no other inputs exist
            assert.equal(tx.ins.length, t.expected.inputs.length)

            // ensure all expected outputs are found
            t.outputs.forEach(function(output) {
              assert(tx.outs.some(function(txOut) {
                var address = bitcoin.Address.fromOutputScript(txOut.script, wallet.network).toString()

                return output.address === address && output.value === txOut.value
              }))
            })

            // ensure no other outputs exist (unless change is expected)
            assert.equal(tx.outs.length, t.outputs.length + !!t.expected.change)

            // enforce the change address is as expected
            if (tx.outs.length > t.outputs.length) {
              var changeAddress = wallet.getChangeAddress()

              assert(tx.outs.some(function(txOut) {
                var address = bitcoin.Address.fromOutputScript(txOut.script, wallet.network).toString()

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

      describe('getAllAddresses', function() {
        it('wraps account.getAllAddresses', sinon.test(function() {
          this.mock(wallet.account).expects('getAllAddresses').once()
          wallet.getAllAddresses()
        }))

        it('returns all known addresses', function() {
          var addresses = f.json.external.addresses.concat(f.json.internal.addresses)

          assert.deepEqual(wallet.getAllAddresses(), addresses)
        })
      })

      describe('getChangeAddress', function() {
        it('wraps account.getChangeAddress', sinon.test(function() {
          this.mock(wallet.account).expects('getInternalAddress').once()
          wallet.getChangeAddress()
        }))

        it('returns the current internal Address', function() {
          wallet.nextAddress()

          assert.equal(wallet.getChangeAddress(), wallet.account.internal.get())
        })
      })

      describe('getReceiveAddress', function() {
        it('wraps account.getExternalAddress', sinon.test(function() {
          this.mock(wallet.account).expects('getExternalAddress').once()
          wallet.getReceiveAddress()
        }))

        it('returns the current external Address', function() {
          wallet.nextAddress()

          assert.equal(wallet.getReceiveAddress(), wallet.account.external.get())
        })
      })

      describe('isReceiveAddress', function() {
        it('wraps account.isExternalAddress', sinon.test(function() {
          this.mock(wallet.account).expects('isExternalAddress').once()
          wallet.isReceiveAddress()
        }))

        it('returns true for a valid receive address', function() {
          assert(wallet.isReceiveAddress(wallet.getReceiveAddress()))
        })
      })

      describe('isChangeAddress', function() {
        it('wraps account.isInternalAddress', sinon.test(function() {
          this.mock(wallet.account).expects('isInternalAddress').once()
          wallet.isChangeAddress()
        }))

        it('returns true for a valid change address', function() {
          assert(wallet.isChangeAddress(wallet.getChangeAddress()))
        })
      })

      describe('nextAddress', function() {
        it('wraps account.nextAddress', sinon.test(function() {
          this.mock(wallet.account).expects('nextAddress').once()
          wallet.nextAddress()
        }))

        it('returns the new external Address', function() {
          var result = wallet.nextAddress()

          assert.equal(result, wallet.getReceiveAddress())
        })
      })

      describe('getBalance', function() {
        beforeEach(function() {
          wallet.setUnspentOutputs(f.json.unspents)
        })

        it('sums all unspents', function() {
          assert.equal(wallet.getBalance(), f.balance)
        })
      })

      describe('getConfirmedBalance', function() {
        beforeEach(function() {
          wallet.setUnspentOutputs(f.json.unspents)
        })

        it('sums confirmed unspents', function() {
          assert.equal(wallet.getConfirmedBalance(), f.confirmedBalance)
        })
      })

      describe('setUnspentOutputs', function() {
        it('sets wallet.unspents correctly', function() {
          wallet.setUnspentOutputs(f.json.unspents)

          assert.equal(wallet.unspents, f.json.unspents)
        })

        // TODO: test validation
      })

      describe('signWith', function() {
        it('signs Transaction inputs with respective keys', function() {
          var txb = new bitcoin.TransactionBuilder()

          f.json.unspents.forEach(function(unspent) {
            txb.addInput(unspent.txId, unspent.vout)
          })

          txb.addOutput(wallet.getReceiveAddress(), 1e5)

          var addresses = f.json.unspents.map(function(unspent) { return unspent.address })
          var tx = wallet.signWith(txb, addresses).build()

          addresses.forEach(function(address, i) {
            var input = tx.ins[i]
            var pubKey = bitcoin.ECPubKey.fromBuffer(input.script.chunks[1])

            assert.equal(pubKey.getAddress(wallet.network).toString(), address)
          })
        })
      })

      describe('toJSON', function() {
        it('exports a JSON object correctly', function() {
          assert.deepEqual(wallet.toJSON(), f.json)
        })
      })
    })
  })
})

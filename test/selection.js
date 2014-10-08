var assert = require('assert')
var bitcoinjs = require('bitcoinjs-lib')

var selectInputs = require('../src/selection')
var fixtures = require('./fixtures/selection.json')

describe('selectInputs', function() {
  fixtures.valid.forEach(function(f) {
    var network, outputs, unspents

    beforeEach(function() {
      outputs = f.outputs.map(function(value) { return { value: value } })
      unspents = f.unspents.map(function(value) { return { value: value } })

      network = bitcoinjs.networks[f.network]
    })

    it(f.description, function() {
      var result = selectInputs(unspents, outputs, network)

      var expected = f.expected.inputs.map(function(i) {
        return unspents[i]
      })

      // ensure change is correctly calculated
      assert.equal(result.change, f.expected.change, 'Invalid change: ' + result.change + ' !== ' + f.expected.change)

      // ensure fee is correctly calculated
      assert.equal(result.fee, f.expected.fee, 'Invalid fee: ' + result.fee + ' !== ' + f.expected.fee)

      // ensure all expected inputs are found
      expected.forEach(function(input) {
        assert(result.inputs.indexOf(input) > -1)
      })

      // ensure no other inputs exist
      assert.equal(result.inputs.length, f.expected.inputs.length)
    })
  })

  fixtures.invalid.forEach(function(f) {
    var network, outputs, unspents

    beforeEach(function() {
      outputs = f.outputs.map(function(value) { return { value: value } })
      unspents = f.unspents.map(function(value) { return { value: value } })

      network = bitcoinjs.networks[f.network]
    })

    it('throws on ' + f.exception, function() {
      assert.throws(function() {
        selectInputs(unspents, outputs, network)
      }, new RegExp(f.exception))
    })
  })
})

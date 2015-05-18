// TODO: integrate privacy calculations, group by address, avoid linking multiple addresses together
// XXX: There may be better optimization techniques available here, may, be.
// TODO: integrate priority calculations
// var COIN = 100000000
// var freeThreshold = COIN * 144 / 250
// var isFree = inputs.reduce(function (accum, input) { return accum + priority(input) }, 0)  >  freeThreshold
//
// function priority(unspent) {
//   // unlike bitcoind, we assume priority is calculated for _right_ now
//   // not the next block
//   return unspent.value * unspent.confirmations
// }

// XXX: these are based on pubKeyHash estimates, the information is ignored so pre-calculated placeholders are used to improve performance
var TX_EMPTY_SIZE = 8
var TX_PUBKEYHASH_INPUT = 40 + 2 + 106
var TX_PUBKEYHASH_OUTPUT = 8 + 2 + 25

function estimateRelayFee (byteLength, feePerKb) {
  return Math.ceil(byteLength / 1000) * feePerKb
}

function selectInputs (unspents, outputs, feePerKb) {
  // sort by descending value
  var sorted = [].concat(unspents).sort(function (o1, o2) {
    return o2.value - o1.value
  })

  var byteLength = TX_EMPTY_SIZE
  var targetValue = 0

  outputs.forEach(function (output) {
    byteLength += TX_PUBKEYHASH_OUTPUT
    targetValue += output.value
  })

  var accum = 0
  var candidates = []
  var total = targetValue

  for (var i = 0; i < sorted.length; ++i) {
    var unspent = sorted[i]

    candidates.push(unspent)

    byteLength += TX_PUBKEYHASH_INPUT
    accum += unspent.value

    // ignore fees until we have the minimum amount
    if (accum < targetValue) continue

    var fee = estimateRelayFee(byteLength, feePerKb)
    var changeFee = estimateRelayFee(byteLength + TX_PUBKEYHASH_OUTPUT, feePerKb)

    total = targetValue + fee
    var changeTotal = targetValue + changeFee

    // do we have enough for a change output
    if (accum >= changeTotal) {
      var change = accum - changeTotal

      return {
        change: change,
        fee: changeFee,
        inputs: candidates
      }
    }

    // no? what about without the change output
    if (accum >= total) {
      return {
        change: 0,
        fee: fee,
        inputs: candidates
      }
    }
  }

  throw new Error('Not enough funds (incl. fee): ' + accum + ' < ' + total)
}

module.exports = selectInputs

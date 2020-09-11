const algosdk = require('algosdk')

async function createASA (algodClient, owner, totalSupply, decimals) {
  try {
    const params = await algodClient.getTransactionParams()

    const suggestedParams = {
      genesisHash: params.genesishashb64,
      genesisID: params.genesisID,
      firstRound: params.lastRound,
      lastRound: params.lastRound + 10,
      fee: params.minFee,
      flatFee: true
    }

    const createAssetTx = algosdk.makeAssetCreateTxnWithSuggestedParams(owner.addr, new Uint8Array(Buffer.from('Wrapped ALGO Asset', 'utf8')), totalSupply, decimals,
      false, owner.addr, owner.addr, owner.addr, owner.addr, 'wALGO', 'Wrapped ALGO', 'https://stakerdao', undefined,
      suggestedParams)
    const createAssetTxSigned = createAssetTx.signTxn(owner.sk)
    const createAssetTxSent = (await algodClient.sendRawTransaction(createAssetTxSigned))
    return createAssetTxSent
  } catch (e) {
    if (e && e.error && e.error.message) {
      console.log(e.error.message)
    } else {
      console.log('Error: ' + e)
    }
  }
}

async function destroyASA (algodClient, owner) {
  try {
    const assetDestroy = algosdk.makeAssetDestroyTxnWithSuggestedParams(owner.addr, new Uint8Array(0), 2654202, suggestedParams)
    const assetDestroySigned = assetDestroy.signTxn(owner.sk)
    const assetDestroySent = (await algodClient.sendRawTransaction(assetDestroySigned))
    return assetDestroySent
  } catch (e) {
    if (e && e.error && e.error.message) {
      console.log(e.error.message)
    } else {
      console.log('Error: ' + e)
    }
  }
}

module.exports = {
  destroyASA: destroyASA,
  createASA: createASA
}

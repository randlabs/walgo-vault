const algosdk = require('algosdk')

async function createASA (algodClient, sender, totalSupply, decimals, signCallback) {
  try {
    const params = await algodClient.getTransactionParams().do()

		params.fee = 1000
		params.flatFee = true

    // const suggestedParams = {
    //   genesisHash: params.genesishashb64,
    //   genesisID: params.genesisID,
    //   firstRound: params.lastRound,
    //   lastRound: params.lastRound + 10,
    //   fee: params.minFee,
    //   flatFee: true
    // }

		const createAssetTx = algosdk.makeAssetCreateTxnWithSuggestedParams(sender, new Uint8Array(Buffer.from('Wrapped ALGO Asset', 'utf8')), 
			totalSupply, decimals, false, sender, sender, sender, sender, 'wALGO', 'Wrapped ALGO', 'https://stakerdao', undefined,
      params)
		const txId = createAssetTx.txID().toString()
		// Sign the transaction
		let createAssetTxSigned = signCallback(sender, createAssetTx)

    await algodClient.sendRawTransaction(createAssetTxSigned).do()
    return txId
  } catch (e) {
    if (e && e.error && e.error.message) {
      console.log(e.error.message)
    } else {
      console.log('Error: ' + e)
    }
  }
}

async function destroyASA (algodClient, sender, asaId, signCallback) {
  try {
    const params = await algodClient.getTransactionParams().do()

		params.fee = 1000
		params.flatFee = true

    const assetDestroy = algosdk.makeAssetDestroyTxnWithSuggestedParams(sender, new Uint8Array(0), asaId, params)
		const txId = assetDestroy.txID().toString()
		// Sign the transaction
		let assetDestroySigned = signCallback(sender, assetDestroy)
    await algodClient.sendRawTransaction(assetDestroySigned).do()
    return txId
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

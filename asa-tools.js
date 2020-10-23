const algosdk = require('algosdk')

async function createASA(algodClient, sender, totalSupply, decimals, unitName, name, url, signCallback) {
  try {
    const params = await algodClient.getTransactionParams().do()

		params.fee = 1000
		params.flatFee = true

		const createAssetTx = algosdk.makeAssetCreateTxnWithSuggestedParams(sender, new Uint8Array(Buffer.from('Wrapped ALGO Asset', 'utf8')), 
			totalSupply, decimals, false, sender, sender, sender, sender, unitName, name, url, undefined,
      params)
		const txId = createAssetTx.txID().toString()

		// Sign the transaction
		let createAssetTxSigned = signCallback(sender, createAssetTx)

    await algodClient.sendRawTransaction(createAssetTxSigned).do()
    return txId
  } catch (e) {
    if (e && e.error && e.error.message) {
			let text = e.error.message
			if(e.error.text) {
				text += ': ' + e.error.text
			}
      console.log('Error createASA: %s', text)
    } else {
      console.log('Error createASA: ' + e)
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

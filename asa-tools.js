const algosdk = require('algosdk');

async function createASA(algodClient, sender, totalSupply, decimals, unitName, name, url, signCallback, sendTx) {
	const params = await algodClient.getTransactionParams().do();

	if (sendTx === undefined) {
		sendTx = true;
	}

	params.fee = 1000;
	params.flatFee = true;

	const createAssetTx = algosdk.makeAssetCreateTxnWithSuggestedParams(
		sender, new Uint8Array(Buffer.from('Wrapped ALGO Asset', 'utf8')),
		totalSupply, decimals, false, sender, sender, sender, sender, unitName, name, url, undefined,
		params
	);
	if (signCallback) {
		const txId = createAssetTx.txID().toString();

		// Sign the transaction
		let createAssetTxSigned = await signCallback(sender, createAssetTx);

		if (sendTx) {
			await algodClient.sendRawTransaction(createAssetTxSigned).do();
			return txId;
		}
		return createAssetTxSigned;
	}

	return createAssetTx;
}

async function destroyASA (algodClient, sender, asaId, signCallback) {
	const params = await algodClient.getTransactionParams().do();

	params.fee = 1000;
	params.flatFee = true;

	const assetDestroy = algosdk.makeAssetDestroyTxnWithSuggestedParams(sender, new Uint8Array(0), asaId, params);
	if (signCallback) {
		const txId = assetDestroy.txID().toString();
		// Sign the transaction
		let assetDestroySigned = signCallback(sender, assetDestroy);
		await algodClient.sendRawTransaction(assetDestroySigned).do();
		return txId;
	}

	return assetDestroy;
}

module.exports = {
	destroyASA: destroyASA,
	createASA: createASA
};

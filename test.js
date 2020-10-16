const algosdk = require('algosdk')
const asaTools = require('./asa-tools')
const vault = require('./vault')
const config = require('./config')

let settings
let burnFee = 150
let mintFee = 200
let creationFee = 550000

let signatures = {}
let addresses
let algodClient

function setupClient() {
	algodClient = settings.algodClient
	signatures = settings.signatures
	addresses = settings.addresses
	mintAddr = addresses[7]

	vaultManager = new vault.VaultManager(algodClient, settings.appId, addresses[0], settings.assetId)
	if(settings.burnFee !== undefined) {
		burnFee = settings.burnFee
	}
	if(settings.mintFee !== undefined) {
		mintFee = settings.mintFee
	}
	if(settings.creationFee !== undefined) {
		creationFee = settings.creationFee
	}
}
function signCallback(sender, tx) {
	const txSigned = tx.signTxn(signatures[sender].sk)
	return txSigned
}

async function testAccount(accountAddr, depositAmount, mintAmount, withdrawAmount, burnAmount) {
	console.log('Testing account %s', accountAddr)

	let txId
	let vaultBalance
	let withdrawalAmount
	let mints

	try {
		console.log('mints')
		mints = await vaultManager.mints(accountAddr)
		console.log('vaultBalance')
		vaultBalance = await vaultManager.vaultBalance(accountAddr)
		if(vaultBalance > vaultManager.minVaultBalance() || mints > 0) {
			withdrawalAmount = vaultBalance - vaultManager.minVaultBalance() - vaultManager.minTransactionFee()
			// just in case it did not opt In
			console.log('vaultAddressByApp')
			let vaultAddr = await vaultManager.vaultAddressByApp(accountAddr)
			if(!vaultAddr) {
				console.log('optIn')
				txId = await vaultManager.optIn(accountAddr, signCallback)
				await vaultManager.waitForTransactionResponse(txId)
			}
			else {
				console.log('setAccountStatus')
				txId = await vaultManager.setAccountStatus(addresses[0], accountAddr, 1, signCallback)

				if(mints) {
					console.log('burnwALGOs')
					txId = await vaultManager.burnwALGOs(accountAddr, mints, signCallback)
					await vaultManager.waitForTransactionResponse(txId)
				}
			}

			withdrawalAmount = await vaultManager.maxWithdrawAmount(accountAddr)

			if(withdrawalAmount > 0) {
				console.log('withdrawALGOs')
				txId = await vaultManager.withdrawALGOs(accountAddr, withdrawalAmount, signCallback)
				console.log('withdrawALGOs: %s', txId)
			}
			await vaultManager.waitForTransactionResponse(txId)
		}

		// when the Vault TEAL is changed both addresses do not match and the CloseOut fails
		let vaultAddrApp = await vaultManager.vaultAddressByApp(accountAddr)
		let vaultAddrTEAL = await vaultManager.vaultAddressByTEAL(accountAddr)
		if(vaultAddrApp == vaultAddrTEAL) {
			console.log('closeOut')
			ublitxId = await vaultManager.closeOut(accountAddr, signCallback)
			console.log('closeOut: %s', txId)
		}
		else if(vaultAddrApp) {
			console.log('Vault TEAL changed: can not make a ClouseOut so call clearApp')
			txId = await vaultManager.clearApp(accountAddr, signCallback)
			console.log('clearApp: %s', txId)
		}
	} catch (err) {
		let text =  err.error

		if (err.text) {
			text = err.text
		}
		else if (err.message) {
			text = err.message
		}

		console.error('ERROR: rolling back vault: %s', text)
	}

	console.log('assetBalance')
	let asaBalance = await vaultManager.assetBalance(accountAddr)
	if(asaBalance !== 0) {
		await vaultManager.transferAsset(accountAddr, addresses[2], 0, addresses[2], signCallback)
	}

	console.log('optIn')
	txId = await vaultManager.optIn(accountAddr, signCallback)
	console.log('optIn: %s', txId)

	console.log('optInASA')
	txId = await vaultManager.optInASA(accountAddr, signCallback)
	console.log('optInASA: %s', txId)	

	console.log('setGlobalStatus')
	txId = await vaultManager.setGlobalStatus(addresses[0], 0, signCallback)
	console.log('setGlobalStatus to 0: %s', txId)

	let txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('printAppCallDelta')
	vaultManager.printAppCallDelta(txResponse)

	// deposit algos can be always done because it does not interact with the App
	console.log('depositALGOs')
	txId = await vaultManager.depositALGOs(accountAddr, depositAmount, signCallback)

	try {
		console.log('setMintAccountAttack')
		// try to send 2 txs in a group to withdraw algos from a user vault from the Admin
		txId = await vaultManager.setMintAccountAttack(addresses[0], mintAddr, accountAddr, signCallback)
		console.error('ERROR: setMintAccountAttack should have failed: %s', txId)
	} catch (err) {
		console.log('setMintAccountAttack successfully failed')
	}

	// it should fail: GlobalStatus == 0
	try {
		console.log('withdrawALGOs')
		txId = await vaultManager.withdrawALGOs(accountAddr, withdrawAmount, signCallback)
		console.error('ERROR: withdrawALGOs should have failed GlobalStatus == 0: %s', txId)
	} catch (err) {
		console.log('withdrawALGOs successfully failed GlobalStatus == 0')
	}

	console.log('setGlobalStatus')
	txId = await vaultManager.setGlobalStatus(addresses[0], 1, signCallback)
	console.log('setGlobalStatus to 1: %s', txId)
	
	console.log('setAccountStatus')
	txId = await vaultManager.setAccountStatus(addresses[0], accountAddr, 0, signCallback)
	console.log('setAccountStatus to 0: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)
	vaultManager.printAppCallDelta(txResponse)

	// it should fail: AccountStatus == 0
	try {
		console.log('withdrawALGOs')
		txId = await vaultManager.withdrawALGOs(accountAddr, withdrawAmount, signCallback)
		console.error('ERROR: withdrawALGOs should have failed AccountStatus == 0: %s', txId)
	} catch (err) {
		console.log('withdrawALGOs successfully failed AccountStatus == 0')
	}

	console.log('setAccountStatus')
	txId = await vaultManager.setAccountStatus(addresses[0], accountAddr, 1, signCallback)
	console.log('setAccountStatus to 1: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('printAppCallDelta')
	vaultManager.printAppCallDelta(txResponse)

	// console.log('adminVaultFees')
	// let collectedFeesTx = await vaultManager.adminVaultFees(accountAddr)
	// console.log('depositALGOs: %s', txId)
	// txResponse = await vaultManager.waitForTransactionResponse(txId)

	// console.log('adminMintFees')
	// collectedFeesTx = await vaultManager.adminVaultFees(accountAddr) - collectedFeesTx
	// console.log('depositALGOs: %s Collected fees %d', txId, collectedFeesTx)

	// let correctFees = Math.floor(depositAmount * settings.burnFee / 10000)
	// if(collectedFeesTx !== correctFees) {
	// 	console.error('ERROR: Deposit fee should be: %d but it was: %d', correctFees, collectedFeesTx)
	// }

	console.log('adminVaultFees')
	let oldFees = await vaultManager.adminVaultFees(accountAddr)
	txId = await vaultManager.mintwALGOs(accountAddr, mintAmount, signCallback)
	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('adminVaultFees')
	collectedFeesTx = await vaultManager.adminVaultFees(accountAddr) - oldFees

	console.log('mintwALGOs: %s Collected fees %d', txId, collectedFeesTx)

	correctFees = Math.floor(mintAmount * settings.mintFee / 10000)
	if(collectedFeesTx !== correctFees) {
		console.error('ERROR: Mint fee should be: %d but it was: %d', correctFees, collectedFeesTx)
	}

	try {
		console.log('withdrawAdminFees')
		txId = await vaultManager.withdrawAdminFees(addresses[0], accountAddr, collectedFeesTx + 1, signCallback)
		console.error('ERROR: withdrawAdminFees should have failed amount exceeds total: %s', txId)
	} catch (err) {
		console.log('withdrawAdminFees successfully failed: amount exceeds total')
	}

	try {
		console.log('withdrawAdminFees')
		txId = await vaultManager.withdrawAdminFees(accountAddr, accountAddr, collectedFeesTx, signCallback)
		console.error('ERROR: withdrawAdminFees should have failed account not admin: %s', txId)
	} catch (err) {
		console.log('withdrawAdminFees successfully failed: account not admin')
	}

	console.log('withdrawAdminFees')
	txId = await vaultManager.withdrawAdminFees(addresses[0], accountAddr, collectedFeesTx, signCallback)

	txResponse = await vaultManager.waitForTransactionResponse(txId)
	let newFees = await vaultManager.adminVaultFees(accountAddr)
	console.log('withdrawAdminFees: %s, Total Pending Fees after: %d', txId, newFees)

	// newFees == to previous fees since we colleted the generated fees
	if(newFees !== oldFees) {
		console.error('ERROR: withdrawAdminFees: current fees should be equal to previous fees but oldFees: %d newFees: %d', oldFees, newFees)
	}

	console.log('withdrawALGOs')
	txId = await vaultManager.withdrawALGOs(accountAddr, withdrawAmount, signCallback)
	console.log('withdrawALGOs: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	collectedFeesTx = await vaultManager.adminVaultFees(accountAddr)
	
	console.log('burnwALGOs')
	txId = await vaultManager.burnwALGOs(accountAddr, burnAmount, signCallback)
	console.log('burnwALGOs: %s', txId)
	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('mints')
	mints = await vaultManager.mints(accountAddr)
	console.log('Net mints: %d', mints)
	if(mints !== (mintAmount - burnAmount)) {
		console.error('ERROR: Net mints should be %d but it is %d', mintAmount - burnAmount, mints)
	}

	console.log('adminVaultFees')
	collectedFeesTx = await vaultManager.adminVaultFees(accountAddr) - collectedFeesTx

	console.log('burnwALGOs: %s Collected fees %d', txId, collectedFeesTx)

	correctFees = Math.floor(burnAmount * settings.burnFee / 10000)
	if(collectedFeesTx !== correctFees) {
		console.error('ERROR: Burn fee should be: %d but it was: %d', correctFees, collectedFeesTx)
	}

	console.log('mints')
	let minted = await vaultManager.mints(accountAddr)
	if(minted != (mintAmount - burnAmount)) {
		console.error('ERROR: minted amount should be: %d', (mintAmount - burnAmount))
	}

	console.log('\nApp Status')
	await vaultManager.printGlobalState(addresses[0])
	console.log('\nApp Account Status')
	await vaultManager.printLocalState(accountAddr)

	// rollback
	console.log('Rollback all operations')

	// try to burn more wALGOs that were minted: ERROR
	try {
		console.log('burnwALGOs')
		txId = await vaultManager.burnwALGOs(accountAddr, mintAmount - burnAmount + 1, signCallback)
		console.error('ERROR: burnwALGOs should have failed: %s', txId)
	} catch (err) {
		console.log('burnwALGOs successfully failed')
	}

	console.log('burnwALGOs')
	txId = await vaultManager.burnwALGOs(accountAddr, mintAmount - burnAmount, signCallback)
	console.log('burnwALGOs %s: %s', accountAddr, txId)
	txResponse = await vaultManager.waitForTransactionResponse(txId)

	let restoreAmount = await vaultManager.maxWithdrawAmount(accountAddr)
	try {
		console.log('withdrawALGOs')
		txId = await vaultManager.withdrawALGOs(accountAddr, restoreAmount + 1, signCallback)
		console.error('ERROR: withdrawALGOs should have failed amount exceeds maximum: %s', txId)
	} catch (err) {
		console.log('withdrawALGOs successfully failed: amount exceeds maximum')
	}

	console.log('withdrawALGOs')
	txId = await vaultManager.withdrawALGOs(accountAddr, restoreAmount, signCallback)
	console.log('withdrawALGOs %s: %s', accountAddr, txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('mints')
	minted = await vaultManager.mints(accountAddr)
	if(minted != 0) {
		console.error('ERROR: mints amount should be: 0')
	}

	collectedFeesTx = await vaultManager.adminVaultFees(accountAddr)

	// the vault balance should be the minimum or equal to pending admin fees
	console.log('vaultBalance')
	vaultBalance = await vaultManager.vaultBalance(accountAddr)
	if(vaultBalance > vaultManager.minVaultBalance() && vaultBalance > collectedFeesTx + vaultManager.minTransactionFee()) {
		console.error('ERROR: vault balance should be very smaller but it is: %d, Pending fees %d', vaultBalance, collectedFeesTx)
	}

	console.log('CloseOut')
	txId = await vaultManager.closeOut(accountAddr, signCallback)
	console.log('CloseOut: %s', txId)

	console.log('Success!!!')
}

async function main () {
	try {
		let txId
		let txResponse

		//console.log('deleteApp')
		// txId = await vaultManager.deleteApp(addresses[0])
		// txResponse = await vaultManager.waitForTransactionResponse(txId)
		// appId = vaultManager.appIdFromCreateAppResponse(txResponse)
		// console.log('AppId: ' + appId)

		//console.log('createApp')
		// txId = await vaultManager.createApp(addresses[0])
		// txResponse = await vaultManager.waitForTransactionResponse(txId)

		// appId = vaultManager.appIdFromCreateAppResponse(txResponse)
		// vaultManager.setAppId(appId)
		// console.log('Create App: AppId: ' + appId)

		console.log('updateApp')
		txId = await vaultManager.updateApp(addresses[0], signCallback)
		console.log('updateApp: %s', txId)

		console.log('setGlobalStatus')
		txId = await vaultManager.setGlobalStatus(addresses[0], 1, signCallback)
		console.log('setGlobalStatus to 1: %s', txId)		
	
		txResponse = await vaultManager.waitForTransactionResponse(txId)

		console.log('setMintAccount')
		txId = await vaultManager.setMintAccount(addresses[0], addresses[1], signCallback)
		console.log('setMintAccount %s: %s', addresses[1], txId)

		console.log('setAdminAccount')
		txId = await vaultManager.setAdminAccount(addresses[0], addresses[2], signCallback)
		console.log('setAdminAccount %s: %s', addresses[2], txId)
		txResponse = await vaultManager.waitForTransactionResponse(txId)

		// use the new admin to set mint account
		console.log('setMintAccount')
		txId = await vaultManager.setMintAccount(addresses[2], mintAddr, signCallback)
		console.log('setMintAccount %s: %s', mintAddr, txId)

		console.log('setGlobalStatus')
		txId = await vaultManager.setGlobalStatus(addresses[2], 1, signCallback)
		console.log('setGlobalStatus to 1: %s', txId)
		// restore admin account
		console.log('setAdminAccount')
		txId = await vaultManager.setAdminAccount(addresses[2], addresses[0], signCallback)
		console.log('setAdminAccount %s: %s', addresses[0], txId)

		txResponse = await vaultManager.waitForTransactionResponse(txId)

		// fails if it the account opted in before
		try {
			txId = await vaultManager.optIn(addresses[0], signCallback)
		} catch(err) {
			console.log('optIn %s: has already opted in', addresses[0])
		}

		try {
			console.log('setMintFee: should fail')
			txId = await vaultManager.setMintFee(addresses[2], 300, signCallback)
			console.error('ERROR: setMintFee should have failed non admin account: %s', txId)
	
		} catch (err) {
			console.log('setMintFee successfully failed')
		}

		try {
			console.log('setMintFee: should fail')
			txId = await vaultManager.setMintFee(addresses[0], 5001, signCallback)
			console.error('ERROR: setMintFee should have failed above maximum (5000): %s', txId)
	
		} catch (err) {
			console.log('setMintFee successfully failed')
		}

		try {
			console.log('setBurnFee: should fail')
			txId = await vaultManager.setBurnFee(addresses[1], 300, signCallback)
			console.error('ERROR: setBurnFee should have failed non admin account: %s', txId)
	
		} catch (err) {
			console.log('setBurnFee successfully failed')
		}

		try {
			console.log('setBurnFee: should fail')
			txId = await vaultManager.setBurnFee(addresses[0], 5001, signCallback)
			console.error('ERROR: setBurnFee should have failed above maximum (5000): %s', txId)
	
		} catch (err) {
			console.log('setBurnFee successfully failed')
		}

		// Reset Withdraw Fee
		console.log('Reset Fees')
		console.log('setBurnFee')
		txId = await vaultManager.setBurnFee(addresses[0], 0, signCallback)
		console.log('setBurnFee: %s', txId)

		// Reset Mint Fee 
		console.log('setMintFee')
		txId = await vaultManager.setMintFee(addresses[0], 0, signCallback)
		console.log('setMintFee: %s', txId)
		
		// Reset Creation Fee 
		console.log('setCreationFee')
		txId = await vaultManager.setCreationFee(addresses[0], 0, signCallback)
		console.log('setCreationFee: %s', txId)

		txResponse = await vaultManager.waitForTransactionResponse(txId)

		console.log('Retrieving burnFee')
		let fee = await vaultManager.burnFee()
		if(fee !== 0) {
			console.error('ERROR: Burn Fee should be %d but it is %d', 0, fee)
		}

		console.log('Retrieving mintFee')
		fee = await vaultManager.mintFee()
		if(fee !== 0) {
			console.error('ERROR: Mint Fee should be %d but it is %d', 0, fee)
		}

		console.log('Retrieving creationFee')
		fee = await vaultManager.creationFee()
		if(fee !== 0) {
			console.error('ERROR: creation Fee should be %d but it is %d', 0, fee)
		}
		try {
			console.log('setCreationFee: should fail')
			txId = await vaultManager.setCreationFee(addresses[2], 300, signCallback)
			console.error('ERROR: setCreationFee should have failed non admin account: %s', txId)
	
		} catch (err) {
			console.log('setCreationFee successfully failed')
		}

		// Burn Fee
		console.log('setBurnFee')
		txId = await vaultManager.setBurnFee(addresses[0], burnFee, signCallback)
		console.log('setBurnFee: %s', txId)

		// Mint Fee 
		txId = await vaultManager.setMintFee(addresses[0], mintFee, signCallback)
		console.log('setMintFee: %s', txId)

		// Mint Fee 
		txId = await vaultManager.setCreationFee(addresses[0], creationFee, signCallback)
		console.log('setMintFee: %s', txId)

		txResponse = await vaultManager.waitForTransactionResponse(txId)

		console.log('Retrieving burnFee')
		fee = await vaultManager.burnFee()
		if(fee !== burnFee) {
			console.error('ERROR: Burn Fee should be %d but it is %d', burnFee, fee)
		}

		console.log('Retrieving mintFee')
		fee = await vaultManager.mintFee()
		if(fee !== mintFee) {
			console.error('ERROR: Mint Fee should be %d but it is %d', mintFee, fee)
		}

		console.log('Retrieving creationFee')
		fee = await vaultManager.creationFee()
		if(fee !== creationFee) {
			console.error('ERROR: creation Fee should be %d but it is %d', creationFee, fee)
		}

		if(addresses[6]) {
			// try to optIn an address whose Vault balance != 0. It should fail, allowing non-zero balance vaults can be attacked by
			// malicius users: ClearState a vault with minted wALGOs and then re-create it
			let vaultAddr = await vaultManager.vaultAddressByTEAL(addresses[6])
			let vaultBalance = await vaultManager.vaultBalance(addresses[6])
			if(vaultBalance == 0) {
				const params = await config.algodClient.getTransactionParams().do()
				params.fee = vaultManager.minFee
				params.flatFee = true

				let txPay = algosdk.makePaymentTxnWithSuggestedParams(addresses[1], vaultAddr, 110000, undefined, new Uint8Array(0), params)
				let txSigned = txPay.signTxn(addresses[1].sk);
				let tx = (await config.algodClient.sendRawTransaction(txSigned).do())
				txPay = algosdk.makePaymentTxnWithSuggestedParams(addresses[1], addresses[6], 110000, undefined, new Uint8Array(0), params)
				txSigned = txPay.signTxn(addresses[1].sk);
				tx = (await config.algodClient.sendRawTransaction(txSigned).do())
				await vaultManager.waitForTransactionResponse(tx.txId)
			}

			try {
				txId = await vaultManager.optIn(addresses[6], signCallback)
				console.error('Error: optIn to non-zero balance Vault should fail Account %s Vault %s txId %s', addresses[6], vaultAddr, txId)
			} catch (err) {
				console.log('optIn to non-zero balance Vault successfully failed')
			}
		}

		await testAccount(addresses[1], 12000405, 4545000, 5500000, 2349000)
		await testAccount(addresses[2], 6000405, 5545000, 300000, 4349000)
		await testAccount(addresses[3], 8000405, 3545000, 4300000, 3349000)
		await testAccount(addresses[4], 9000405, 8545000, 325230, 7349000)
		await testAccount(addresses[5], 4000405, 3900405, 4500, 3900000)

	} catch (err) {
		let text =  err.error

		if (err.text) {
			text = err.text
		}
		else if (err.message) {
			text = err.message
		}

		throw new Error('ERROR: ' + text)
	}

	// ASA ID Testnet: 11870752
	// let tx = await asaTools.createASA(config.algodClient, managerAccount, 9007199254740991, 6);
}

settings = config.initialize()

setupClient()
main()

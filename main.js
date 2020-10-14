const algosdk = require('algosdk')
const asaTools = require('./asa-tools')
const vault = require('./vault')
const config = require('./config')

let algodClient
let adminAccount
let account1
let account2
let account3
let account4
let account5
let account6
let settings
let burnFee = 150
let mintFee = 200
let creationFee = 550000

let signatures = {}

function recoverManagerAccount () {
	// Private key mnemonic: town memory type rapid ugly aim yard moon rocket lobster survey series mesh plate great seed company vote debris limb view motion label absorb swear

	// WALBWVI43IKS7YJJADD7WGE4C4TS3OTOJOEAVEWNXEJS6CXH7OJIVKKHME
	//  const passphrase = 'clay vast only enact sibling axis seven around drip cruise era alcohol police web planet increase winter exclude rain pyramid art alert tool absent pave'
	//  return myAccount

	// const myAccount = algosdk.mnemonicToSecretKey(passphrase)
	adminAccount = algosdk.mnemonicToSecretKey(settings.adminAccount.privateKey)
	signatures[adminAccount.addr] = adminAccount.sk
	account1 = algosdk.mnemonicToSecretKey(settings.account1.privateKey)
	signatures[account1.addr] = account1.sk
	account2 = algosdk.mnemonicToSecretKey(settings.account2.privateKey)
	signatures[account2.addr] = account2.sk
	account3 = algosdk.mnemonicToSecretKey(settings.account3.privateKey)
	signatures[account3.addr] = account3.sk
	account4 = algosdk.mnemonicToSecretKey(settings.account4.privateKey)
	signatures[account4.addr] = account4.sk
	account5 = algosdk.mnemonicToSecretKey(settings.account5.privateKey)
	signatures[account5.addr] = account5.sk
	account6 = algosdk.mnemonicToSecretKey(settings.account6.privateKey)
	signatures[account6.addr] = account6.sk
}

async function setupClient () {
	if (algodClient == null) {
		algodClient = new algosdk.Algodv2(settings.algodClient.apiToken, settings.algodClient.server, settings.algodClient.port)

		vaultManager = new vault.VaultManager(algodClient, settings.appId, adminAccount.addr, settings.assetId)
		if(settings.burnFee !== undefined) {
			burnFee = settings.burnFee
		}
		if(settings.mintFee !== undefined) {
			mintFee = settings.mintFee
		}
		if(settings.creationFee !== undefined) {
			creationFee = settings.creationFee
		}
	} else {
		return algodClient
	}

	return algodClient
}

function signCallback(sender, tx) {
	const txSigned = tx.signTxn(signatures[sender])
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
				txId = await vaultManager.setAccountStatus(adminAccount.addr, accountAddr, 1, signCallback)

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
		await vaultManager.transferAsset(accountAddr, settings.mintAccountAddr, 0, settings.mintAccountAddr, signCallback)
	}

	console.log('optIn')
	txId = await vaultManager.optIn(accountAddr, signCallback)
	console.log('optIn: %s', txId)

	console.log('optInASA')
	txId = await vaultManager.optInASA(accountAddr, signCallback)
	console.log('optInASA: %s', txId)	

	console.log('setGlobalStatus')
	txId = await vaultManager.setGlobalStatus(adminAccount.addr, 0, signCallback)
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
		txId = await vaultManager.setMintAccountAttack(adminAccount.addr, settings.mintAccountAddr, accountAddr, signCallback)
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
	txId = await vaultManager.setGlobalStatus(adminAccount.addr, 1, signCallback)
	console.log('setGlobalStatus to 1: %s', txId)
	
	console.log('setAccountStatus')
	txId = await vaultManager.setAccountStatus(adminAccount.addr, accountAddr, 0, signCallback)
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
	txId = await vaultManager.setAccountStatus(adminAccount.addr, accountAddr, 1, signCallback)
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
		txId = await vaultManager.withdrawAdminFees(adminAccount.addr, accountAddr, collectedFeesTx + 1, signCallback)
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
	txId = await vaultManager.withdrawAdminFees(adminAccount.addr, accountAddr, collectedFeesTx, signCallback)

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
	await vaultManager.printGlobalState(adminAccount.addr)
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
		// txId = await vaultManager.deleteApp(adminAccount.addr)
		// txResponse = await vaultManager.waitForTransactionResponse(txId)
		// appId = vaultManager.appIdFromCreateAppResponse(txResponse)
		// console.log('AppId: ' + appId)

		//console.log('createApp')
		// txId = await vaultManager.createApp(adminAccount.addr)
		// txResponse = await vaultManager.waitForTransactionResponse(txId)

		// appId = vaultManager.appIdFromCreateAppResponse(txResponse)
		// vaultManager.setAppId(appId)
		// console.log('Create App: AppId: ' + appId)

		console.log('updateApp')
		txId = await vaultManager.updateApp(adminAccount.addr, signCallback)
		console.log('updateApp: %s', txId)

		console.log('setGlobalStatus')
		txId = await vaultManager.setGlobalStatus(adminAccount.addr, 1, signCallback)
		console.log('setGlobalStatus to 1: %s', txId)		
	
		txResponse = await vaultManager.waitForTransactionResponse(txId)

		console.log('setMintAccount')
		txId = await vaultManager.setMintAccount(adminAccount.addr, account1.addr, signCallback)
		console.log('setMintAccount %s: %s', account1.addr, txId)

		console.log('setAdminAccount')
		txId = await vaultManager.setAdminAccount(adminAccount.addr, account2.addr, signCallback)
		console.log('setAdminAccount %s: %s', account2.addr, txId)
		txResponse = await vaultManager.waitForTransactionResponse(txId)

		// use the new admin to set mint account
		console.log('setMintAccount')
		txId = await vaultManager.setMintAccount(account2.addr, settings.mintAccountAddr, signCallback)
		console.log('setMintAccount %s: %s', settings.mintAccountAddr, txId)

		console.log('setGlobalStatus')
		txId = await vaultManager.setGlobalStatus(account2.addr, 1, signCallback)
		console.log('setGlobalStatus to 1: %s', txId)
		// restore admin account
		console.log('setAdminAccount')
		txId = await vaultManager.setAdminAccount(account2.addr, adminAccount.addr, signCallback)
		console.log('setAdminAccount %s: %s', adminAccount.addr, txId)

		txResponse = await vaultManager.waitForTransactionResponse(txId)

		// fails if it the account opted in before
		try {
			txId = await vaultManager.optIn(adminAccount.addr, signCallback)
		} catch(err) {
			console.log('optIn %s: has already opted in', adminAccount.addr)
		}

		try {
			console.log('setMintFee: should fail')
			txId = await vaultManager.setMintFee(account2.addr, 300, signCallback)
			console.error('ERROR: setMintFee should have failed non admin account: %s', txId)
	
		} catch (err) {
			console.log('setMintFee successfully failed')
		}

		try {
			console.log('setMintFee: should fail')
			txId = await vaultManager.setMintFee(adminAccount.addr, 5001, signCallback)
			console.error('ERROR: setMintFee should have failed above maximum (5000): %s', txId)
	
		} catch (err) {
			console.log('setMintFee successfully failed')
		}

		try {
			console.log('setBurnFee: should fail')
			txId = await vaultManager.setBurnFee(account1.addr, 300, signCallback)
			console.error('ERROR: setBurnFee should have failed non admin account: %s', txId)
	
		} catch (err) {
			console.log('setBurnFee successfully failed')
		}

		try {
			console.log('setBurnFee: should fail')
			txId = await vaultManager.setBurnFee(adminAccount.addr, 5001, signCallback)
			console.error('ERROR: setBurnFee should have failed above maximum (5000): %s', txId)
	
		} catch (err) {
			console.log('setBurnFee successfully failed')
		}

		// Reset Withdraw Fee
		console.log('Reset Fees')
		console.log('setBurnFee')
		txId = await vaultManager.setBurnFee(adminAccount.addr, 0, signCallback)
		console.log('setBurnFee: %s', txId)

		// Reset Mint Fee 
		console.log('setMintFee')
		txId = await vaultManager.setMintFee(adminAccount.addr, 0, signCallback)
		console.log('setMintFee: %s', txId)
		
		// Reset Creation Fee 
		console.log('setCreationFee')
		txId = await vaultManager.setCreationFee(adminAccount.addr, 0, signCallback)
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
			txId = await vaultManager.setCreationFee(account2.addr, 300, signCallback)
			console.error('ERROR: setCreationFee should have failed non admin account: %s', txId)
	
		} catch (err) {
			console.log('setCreationFee successfully failed')
		}

		// Burn Fee
		console.log('setBurnFee')
		txId = await vaultManager.setBurnFee(adminAccount.addr, burnFee, signCallback)
		console.log('setBurnFee: %s', txId)

		// Mint Fee 
		txId = await vaultManager.setMintFee(adminAccount.addr, mintFee, signCallback)
		console.log('setMintFee: %s', txId)

		// Mint Fee 
		txId = await vaultManager.setCreationFee(adminAccount.addr, creationFee, signCallback)
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

		// try to optIn an address whose Vault balance != 0. It should fail, allowing non-zero balance vaults can be attacked by
		// malicius users: ClearState a vault with minted wALGOs and then re-create it
		let vaultAddr = await vaultManager.vaultAddressByTEAL(account6.addr)
		let vaultBalance = await vaultManager.vaultBalance(account6.addr)
		if(vaultBalance == 0) {
			const params = await algodClient.getTransactionParams().do()
			params.fee = vaultManager.minFee
			params.flatFee = true

			let txPay = algosdk.makePaymentTxnWithSuggestedParams(account1.addr, vaultAddr, 110000, undefined, new Uint8Array(0), params)
			let txSigned = txPay.signTxn(account1.sk);
			let tx = (await algodClient.sendRawTransaction(txSigned).do())
			txPay = algosdk.makePaymentTxnWithSuggestedParams(account1.addr, account6.addr, 110000, undefined, new Uint8Array(0), params)
			txSigned = txPay.signTxn(account1.sk);
			tx = (await algodClient.sendRawTransaction(txSigned).do())
			await vaultManager.waitForTransactionResponse(tx.txId)
		}

		try {
			txId = await vaultManager.optIn(account6.addr, signCallback)
			console.error('Error: optIn to non-zero balance Vault should fail Account %s Vault %s txId %s', account6.addr, vaultAddr, txId)
		} catch (err) {
			console.log('optIn to non-zero balance Vault successfully failed')
		}

		await testAccount(account1.addr, 12000405, 4545000, 5500000, 2349000)
		await testAccount(account2.addr, 6000405, 5545000, 300000, 4349000)
		await testAccount(account3.addr, 8000405, 3545000, 4300000, 3349000)
		await testAccount(account4.addr, 9000405, 8545000, 325230, 7349000)
		await testAccount(account5.addr, 4000405, 3900405, 4500, 3900000)

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
	// let tx = await asaTools.createASA(algodClient, managerAccount, 9007199254740991, 6);
}

settings = config.get()

recoverManagerAccount()
setupClient()
main()

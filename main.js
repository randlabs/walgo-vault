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
let settings
let burnFee = 150
let mintFee = 200

function recoverManagerAccount () {
	// Private key mnemonic: town memory type rapid ugly aim yard moon rocket lobster survey series mesh plate great seed company vote debris limb view motion label absorb swear

	// WALBWVI43IKS7YJJADD7WGE4C4TS3OTOJOEAVEWNXEJS6CXH7OJIVKKHME
	//  const passphrase = 'clay vast only enact sibling axis seven around drip cruise era alcohol police web planet increase winter exclude rain pyramid art alert tool absent pave'
	//  return myAccount

	// const myAccount = algosdk.mnemonicToSecretKey(passphrase)
	adminAccount = algosdk.mnemonicToSecretKey(settings.adminAccount.privateKey)
	account1 = algosdk.mnemonicToSecretKey(settings.account1.privateKey)
	account2 = algosdk.mnemonicToSecretKey(settings.account2.privateKey)
	account3 = algosdk.mnemonicToSecretKey(settings.account3.privateKey)
	account4 = algosdk.mnemonicToSecretKey(settings.account4.privateKey)
	account5 = algosdk.mnemonicToSecretKey(settings.account5.privateKey)
}

async function setupClient () {
	if (algodClient == null) {
		algodClient = new algosdk.Algodv2(settings.algodClient.apiToken, settings.algodClient.server, settings.algodClient.port)

		vaultManager = new vault.VaultManager(algodClient, settings.appId, adminAccount.addr, settings.assetId)
		if(settings.burnFee) {
			burnFee = settings.burnFee
		}
		if(settings.mintFee) {
			mintFee = settings.mintFee
		}

	} else {
		return algodClient
	}

	return algodClient
}

async function testAccount(account, depositAmount, mintAmount, withdrawAmount, burnAmount) {
	console.log('Testing account %s', account.addr)

	let txId
	let vaultBalance
	let withdrawalAmount

	try {
		console.log('mints')
		let mintAmount = await vaultManager.mints(account.addr)
		console.log('vaultBalance')
		vaultBalance = await vaultManager.vaultBalance(account.addr)
		if(vaultBalance > vaultManager.minVaultBalance() || mintAmount > 0) {
			withdrawalAmount = vaultBalance - vaultManager.minVaultBalance() - vaultManager.minTransactionFee()
			// just in case it did not opt In
			console.log('vaultAddressByApp')
			let vaultAddr = await vaultManager.vaultAddressByApp(account.addr)
			if(!vaultAddr) {
				console.log('optIn')
				txId = await vaultManager.optIn(account)
				await vaultManager.waitForTransactionResponse(txId)
			}
			else {
				console.log('setAccountStatus')
				txId = await vaultManager.setAccountStatus(adminAccount, account.addr, 1)

				if(mintAmount) {
					console.log('burnwALGOs')
					txId = await vaultManager.burnwALGOs(account, mintAmount)
					await vaultManager.waitForTransactionResponse(txId)
				}
			}

			withdrawalAmount = await vaultManager.maxWithdrawAmount(account.addr)

			if(withdrawalAmount > 0) {
				console.log('withdrawALGOs')
				txId = await vaultManager.withdrawALGOs(account, withdrawalAmount)
				console.log('withdrawALGOs: %s', txId)
			}
			await vaultManager.waitForTransactionResponse(txId)
		}

		// when the Vault TEAL is changed both addresses do not match and the CloseOut fails
		let vaultAddrApp = await vaultManager.vaultAddressByApp(account.addr)
		let vaultAddrTEAL = await vaultManager.vaultAddressByTEAL(account.addr)
		if(vaultAddrApp == vaultAddrTEAL) {
			console.log('closeOut')
			ublitxId = await vaultManager.closeOut(account)
			console.log('closeOut: %s', txId)
		}
		else if(vaultAddrApp) {
			console.log('Vault TEAL changed: can not make a ClouseOut so call clearApp')
			txId = await vaultManager.clearApp(account)
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
	let asaBalance = await vaultManager.assetBalance(account.addr)
	if(asaBalance !== 0) {
		await vaultManager.transferAsset(account, settings.mintAccountAddr, 0, settings.mintAccountAddr)
	}

	console.log('optIn')
	txId = await vaultManager.optIn(account)
	console.log('optIn: %s', txId)

	console.log('optInASA')
	txId = await vaultManager.optInASA(account)
	console.log('optInASA: %s', txId)	

	console.log('setGlobalStatus')
	txId = await vaultManager.setGlobalStatus(adminAccount, 0)
	console.log('setGlobalStatus to 0: %s', txId)

	let txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('printAppCallDelta')
	vaultManager.printAppCallDelta(txResponse)

	// deposit algos can be always done because it does not interact with the App
	console.log('depositALGOs')
	txId = await vaultManager.depositALGOs(account, depositAmount)

	try {
		console.log('setMintAccountAttack')
		// try to send 2 txs in a group to withdraw algos from a user vault from the Admin
		txId = await vaultManager.setMintAccountAttack(adminAccount, settings.mintAccountAddr, account.addr)
		console.error('ERROR: setMintAccountAttack should have failed: %s', txId)
	} catch (err) {
		console.log('setMintAccountAttack successfully failed')
	}

	// it should fail: GlobalStatus == 0
	try {
		console.log('withdrawALGOs')
		txId = await vaultManager.withdrawALGOs(account, withdrawAmount)	
		console.error('ERROR: withdrawALGOs should have failed GlobalStatus == 0: %s', txId)
	} catch (err) {
		console.log('withdrawALGOs successfully failed GlobalStatus == 0')
	}

	console.log('setGlobalStatus')
	txId = await vaultManager.setGlobalStatus(adminAccount, 1)
	console.log('setGlobalStatus to 1: %s', txId)
	
	console.log('setAccountStatus')
	txId = await vaultManager.setAccountStatus(adminAccount, account.addr, 0)
	console.log('setAccountStatus to 0: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)
	vaultManager.printAppCallDelta(txResponse)

	// it should fail: AccountStatus == 0
	try {
		console.log('withdrawALGOs')
		txId = await vaultManager.withdrawALGOs(account, withdrawAmount)	
		console.error('ERROR: withdrawALGOs should have failed AccountStatus == 0: %s', txId)
	} catch (err) {
		console.log('withdrawALGOs successfully failed AccountStatus == 0')
	}

	console.log('setAccountStatus')
	txId = await vaultManager.setAccountStatus(adminAccount, account.addr, 1)
	console.log('setAccountStatus to 1: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('printAppCallDelta')
	vaultManager.printAppCallDelta(txResponse)

	// console.log('adminVaultFees')
	// let collectedFeesTx = await vaultManager.adminVaultFees(account.addr)
	// console.log('depositALGOs: %s', txId)
	// txResponse = await vaultManager.waitForTransactionResponse(txId)

	// console.log('adminMintFees')
	// collectedFeesTx = await vaultManager.adminVaultFees(account.addr) - collectedFeesTx
	// console.log('depositALGOs: %s Collected fees %d', txId, collectedFeesTx)

	// let correctFees = Math.floor(depositAmount * settings.burnFee / 10000)
	// if(collectedFeesTx !== correctFees) {
	// 	console.error('ERROR: Deposit fee should be: %d but it was: %d', correctFees, collectedFeesTx)
	// }

	console.log('adminVaultFees')
	let oldFees = await vaultManager.adminVaultFees(account.addr)
	txId = await vaultManager.mintwALGOs(account, mintAmount)
	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('adminVaultFees')
	collectedFeesTx = await vaultManager.adminVaultFees(account.addr) - oldFees

	console.log('mintwALGOs: %s Collected fees %d', txId, collectedFeesTx)

	correctFees = Math.floor(mintAmount * settings.mintFee / 10000)
	if(collectedFeesTx !== correctFees) {
		console.error('ERROR: Mint fee should be: %d but it was: %d', correctFees, collectedFeesTx)
	}

	try {
		console.log('withdrawAdminFees')
		txId = await vaultManager.withdrawAdminFees(adminAccount, account.addr, collectedFeesTx + 1)
		console.error('ERROR: withdrawAdminFees should have failed amount exceeds total: %s', txId)
	} catch (err) {
		console.log('withdrawAdminFees successfully failed: amount exceeds total')
	}

	try {
		console.log('withdrawAdminFees')
		txId = await vaultManager.withdrawAdminFees(account, account.addr, collectedFeesTx)
		console.error('ERROR: withdrawAdminFees should have failed account not admin: %s', txId)
	} catch (err) {
		console.log('withdrawAdminFees successfully failed: account not admin')
	}

	console.log('withdrawAdminFees')
	txId = await vaultManager.withdrawAdminFees(adminAccount, account.addr, collectedFeesTx)

	txResponse = await vaultManager.waitForTransactionResponse(txId)
	let newFees = await vaultManager.adminVaultFees(account.addr)
	console.log('withdrawAdminFees: %s, Total Pending Fees after: %d', txId, newFees)

	// newFees == to previous fees since we colleted the generated fees
	if(newFees !== oldFees) {
		console.error('ERROR: withdrawAdminFees: current fees should be equal to previous fees but oldFees: %d newFees: %d', oldFees, newFees)
	}

	console.log('withdrawALGOs')
	txId = await vaultManager.withdrawALGOs(account, withdrawAmount)
	console.log('withdrawALGOs: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	collectedFeesTx = await vaultManager.adminVaultFees(account.addr)
	
	console.log('burnwALGOs')
	txId = await vaultManager.burnwALGOs(account, burnAmount)
	console.log('burnwALGOs: %s', txId)
	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('adminVaultFees')
	collectedFeesTx = await vaultManager.adminVaultFees(account.addr) - collectedFeesTx

	console.log('burnwALGOs: %s Collected fees %d', txId, collectedFeesTx)

	correctFees = Math.floor(burnAmount * settings.burnFee / 10000)
	if(collectedFeesTx !== correctFees) {
		console.error('ERROR: Burn fee should be: %d but it was: %d', correctFees, collectedFeesTx)
	}

	console.log('mints')
	let minted = await vaultManager.mints(account.addr)
	if(minted != (mintAmount - burnAmount)) {
		console.error('ERROR: minted amount should be: %d', (mintAmount - burnAmount))
	}

	console.log('\nApp Status')
	await vaultManager.printGlobalState(adminAccount.addr)
	console.log('\nApp Account Status')
	await vaultManager.printLocalState(account.addr)

	// rollback
	console.log('Rollback all operations')

	// try to burn more wALGOs that were minted: ERROR
	try {
		console.log('burnwALGOs')
		txId = await vaultManager.burnwALGOs(account, mintAmount - burnAmount + 1)
		console.error('ERROR: burnwALGOs should have failed: %s', txId)
	} catch (err) {
		console.log('burnwALGOs successfully failed')
	}

	console.log('burnwALGOs')
	txId = await vaultManager.burnwALGOs(account, mintAmount - burnAmount)
	console.log('burnwALGOs %s: %s', account.addr, txId)
	txResponse = await vaultManager.waitForTransactionResponse(txId)

	let restoreAmount = await vaultManager.maxWithdrawAmount(account.addr)
	try {
		console.log('withdrawALGOs')
		txId = await vaultManager.withdrawALGOs(account, restoreAmount + 1)
		console.error('ERROR: withdrawALGOs should have failed amount exceeds maximum: %s', txId)
	} catch (err) {
		console.log('withdrawALGOs successfully failed: amount exceeds maximum')
	}

	console.log('withdrawALGOs')
	txId = await vaultManager.withdrawALGOs(account, restoreAmount)
	console.log('withdrawALGOs %s: %s', account.addr, txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('mints')
	minted = await vaultManager.mints(account.addr)
	if(minted != 0) {
		console.error('ERROR: mints amount should be: 0')
	}

	collectedFeesTx = await vaultManager.adminVaultFees(account.addr)

	// the vault balance should be the minimum or equal to pending admin fees
	console.log('vaultBalance')
	vaultBalance = await vaultManager.vaultBalance(account.addr)
	if(vaultBalance > vaultManager.minVaultBalance() && vaultBalance > collectedFeesTx + vaultManager.minTransactionFee()) {
		console.error('ERROR: vault balance should be very smaller but it is: %d, Pending fees %d', vaultBalance, collectedFeesTx)
	}

	console.log('CloseOut')
	txId = await vaultManager.closeOut(account)
	console.log('CloseOut: %s', txId)

	console.log('Success!!!')
}

async function main () {
	try {
		let txId
		let txResponse

		// txId = await vaultManager.closeOut(account1)
		// txId = await vaultManager.closeOut(account2)
		// txId = await vaultManager.closeOut(account3)
		// txId = await vaultManager.closeOut(account4)
		// txId = await vaultManager.closeOut(account5)
		// txId = await vaultManager.closeOut(adminAccount)

		// await vaultManager.printLocalState(account2.addr)

		// txId = await vaultManager.withdrawALGOs(account2, 18398532)
		// console.log('withdrawALGOs %s: %s', account2.addr, txId)

		// let txRet = await vaultManager.waitForTransactionResponse(txId)
		// vaultManager.printAppCallDelta(txRet)

		// await vaultManager.printLocalState(account2.addr)

		// return
		//console.log('deleteApp')
		// txId = await vaultManager.deleteApp(adminAccount)
		// txResponse = await vaultManager.waitForTransactionResponse(txId)
		// appId = vaultManager.appIdFromCreateAppResponse(txResponse)
		// console.log('AppId: ' + appId)

		//console.log('createApp')
		// txId = await vaultManager.createApp(adminAccount)
		// txResponse = await vaultManager.waitForTransactionResponse(txId)

		// appId = vaultManager.appIdFromCreateAppResponse(txResponse)
		// vaultManager.setAppId(appId)
		// console.log('Create App: AppId: ' + appId)

		// await vaultManager.optIn(account4)

		console.log('updateApp')
		txId = await vaultManager.updateApp(adminAccount)
		console.log('updateApp: %s', txId)

		console.log('setGlobalStatus')
		txId = await vaultManager.setGlobalStatus(adminAccount, 1)
		console.log('setGlobalStatus to 1: %s', txId)		
	
		txResponse = await vaultManager.waitForTransactionResponse(txId)

		console.log('setMintAccount')
		txId = await vaultManager.setMintAccount(adminAccount, account1.addr)
		console.log('setMintAccount %s: %s', account1.addr, txId)

		console.log('setAdminAccount')
		txId = await vaultManager.setAdminAccount(adminAccount, account2.addr)
		console.log('setAdminAccount %s: %s', account2.addr, txId)
		txResponse = await vaultManager.waitForTransactionResponse(txId)

		// use the new admin to set mint account
		console.log('setMintAccount')
		txId = await vaultManager.setMintAccount(account2, settings.mintAccountAddr)
		console.log('setMintAccount %s: %s', settings.mintAccountAddr, txId)

		console.log('setGlobalStatus')
		txId = await vaultManager.setGlobalStatus(account2, 1)
		console.log('setGlobalStatus to 1: %s', txId)
		// restore admin account
		console.log('setAdminAccount')
		txId = await vaultManager.setAdminAccount(account2, adminAccount.addr)
		console.log('setAdminAccount %s: %s', adminAccount.addr, txId)

		txResponse = await vaultManager.waitForTransactionResponse(txId)

		// fails if it the account opted in before
		try {
			txId = await vaultManager.optIn(adminAccount)
		} catch(err) {
			console.log('optIn %s: has already opted in', adminAccount.addr)
		}

		// Reset Withdraw Fee
		console.log('Reset Fees')
		console.log('setBurnFee')
		txId = await vaultManager.setBurnFee(adminAccount, 0)
		console.log('setBurnFee: %s', txId)

		// Reset Mint Fee 
		console.log('setMintFee')
		txId = await vaultManager.setMintFee(adminAccount, 0)
		console.log('setMintFee: %s', txId)
		
		try {
			console.log('setMintFee: should fail')
			txId = await vaultManager.setMintFee(account1, 300)
			console.error('ERROR: setMintFee should have failed non admin account: %s', txId)
	
		} catch (err) {
			console.log('setMintFee successfully failed')
		}

		try {
			console.log('setMintFee: should fail')
			txId = await vaultManager.setMintFee(adminAccount, 5001)
			console.error('ERROR: setMintFee should have failed above maximum (5000): %s', txId)
	
		} catch (err) {
			console.log('setMintFee successfully failed')
		}

		try {
			console.log('setBurnFee: should fail')
			txId = await vaultManager.setBurnFee(account1, 300)
			console.error('ERROR: setBurnFee should have failed non admin account: %s', txId)
	
		} catch (err) {
			console.log('setBurnFee successfully failed')
		}

		try {
			console.log('setBurnFee: should fail')
			txId = await vaultManager.setBurnFee(adminAccount, 5001)
			console.error('ERROR: setBurnFee should have failed above maximum (5000): %s', txId)
	
		} catch (err) {
			console.log('setBurnFee successfully failed')
		}

		// Burn Fee
		console.log('setBurnFee')
		txId = await vaultManager.setBurnFee(adminAccount, burnFee)
		console.log('setBurnFee: %s', txId)

		// Mint Fee 
		txId = await vaultManager.setMintFee(adminAccount, mintFee)
		console.log('setMintFee: %s', txId)

		txResponse = await vaultManager.waitForTransactionResponse(txId)

		console.log('Retrieving burnFee')
		let fee = await vaultManager.burnFee()
		if(fee !== burnFee) {
			console.error('ERROR: Burn Fee should be %d but it is %d', burnFee, fee)
		}

		console.log('Retrieving mintFee')
		fee = await vaultManager.mintFee()
		if(fee !== mintFee) {
			console.error('ERROR: Mint Fee should be %d but it is %d', mintFee, fee)
		}

		await testAccount(account1, 12000405, 4545000, 5500000, 2349000)
		await testAccount(account2, 6000405, 5545000, 300000, 4349000)
		await testAccount(account3, 8000405, 3545000, 4300000, 3349000)
		await testAccount(account4, 9000405, 8545000, 325230, 7349000)
		await testAccount(account5, 4000405, 3900405, 4500, 3900000)

		return
		try {
			txId = await vaultManager.clearApp(account1)
			console.log('clearApp %s: %s', account1.addr, txId)
		} catch (err) {
		}
		try {
			txId = await vaultManager.clearApp(account2)
			console.log('clearApp %s: %s', account2.addr, txId)
		} catch (err) {
		}
		try {
			txId = await vaultManager.clearApp(account3)
			console.log('clearApp %s: %s', account3.addr, txId)
		} catch (err) {
		}
		try {
			txId = await vaultManager.clearApp(account4)
			console.log('clearApp %s: %s', account4.addr, txId)
		} catch (err) {
		}
		txId = await vaultManager.optIn(account1)
		console.log('optIn %s: %s', account2.addr, txId)

		txId = await vaultManager.optIn(account2)
		console.log('optIn %s: %s', account2.addr, txId)

		txId = await vaultManager.optIn(account3)
		console.log('optIn %s: %s', account2.addr, txId)

		txId = await vaultManager.optIn(account4)
		console.log('optIn %s: %s', account2.addr, txId)

		// txId = await vaultManager.setAccountStatus(adminAccount, account2.addr, 0)
		// console.log('setAccountStatus %s to 0: %s', account2.addr, txId)

		txId = await vaultManager.setGlobalStatus(adminAccount, 0)
		console.log('setGlobalStatus to 0: %s', txId)

		txResponse = await vaultManager.waitForTransactionResponse(txId)
		vaultManager.printAppCallDelta(txResponse)
		// it should fail
		try {
			txId = await vaultManager.registerVault(account2)
			console.log('ERROR: registerVault should have failed %s: %s', account2.addr, txId)
	
		} catch (err) {
			console.log('Register successfully failed')
		}

		txId = await vaultManager.setGlobalStatus(adminAccount, 1)
		console.log('setGlobalStatus to 1: %s', txId)
		
		// txId = await vaultManager.setAccountStatus(adminAccount, account2.addr, 1)
		// console.log('setAccountStatus %s to 1: %s', account2.addr, txId)

		txId = await vaultManager.registerVault(account2)
		console.log('registerVault %s: %s', account2.addr, txId)
		
		txResponse = await vaultManager.waitForTransactionResponse(txId)
		vaultManager.printAppCallDelta(txResponse)

		txId = await vaultManager.depositALGOs(account2, 1234000)
		console.log('depositALGOs %s: %s', account2.addr, txId)

		txId = await vaultManager.mintwALGOs(account2, 5300)
		console.log('mintwALGOs %s: %s', account2.addr, txId)

		txId = await vaultManager.withdrawALGOs(account2, 500300)
		console.log('withdrawALGOs %s: %s', account2.addr, txId)

		txId = await vaultManager.burnwALGOs(account2, 5300)
		console.log('burnwALGOs %s: %s', account2.addr, txId)

		txResponse = await vaultManager.waitForTransactionResponse(txId)

		console.log('\nApp Status')
		await vaultManager.printGlobalState(adminAccount.addr)
		await vaultManager.printLocalState(adminAccount.addr)
		await vaultManager.printLocalState(account1.addr)
		await vaultManager.printLocalState(account2.addr)
		await vaultManager.printLocalState(account3.addr)
		await vaultManager.printLocalState(account4.addr)
		await vaultManager.printLocalState(account5.addr)

		console.log('Success!!!')
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

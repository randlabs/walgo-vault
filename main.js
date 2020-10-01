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
let withdrawalFee = 150
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
		if(settings.withdrawalFee) {
			withdrawalFee = settings.withdrawalFee
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
	let amount
	let vaultBalance
	let withdrawalAmount

	try {
		let mintAmount = await vaultManager.mints(account.addr)
		vaultBalance = await vaultManager.vaultBalance(account.addr)
		if(vaultBalance > 100000 || mintAmount > 0) {
			withdrawalAmount = vaultBalance - vaultManager.vaultMinimumBalance() - vaultManager.minTransactionFee()
			// just in case it did not opt In
			let vaultAddr = await vaultManager.vaultAddressByApp(account.addr)
			if(!vaultAddr) {
				txId = await vaultManager.optIn(account)
				await vaultManager.waitForTransactionResponse(txId)
			}
			else {
				txId = await vaultManager.setAccountStatus(adminAccount, account.addr, 1)

				if(mintAmount) {
					txId = await vaultManager.burnwALGOs(account, mintAmount)
					await vaultManager.waitForTransactionResponse(txId)
				}
			}

			// withdrawalAmount = vaultBalance - vaultManager.minTransactionFee() - amount

			// if(vaultBalance - withdrawalAmount < vaultManager.vaultMinimumBalance()) {
			// 	withdrawalAmount = vaultBalance - vaultManager.vaultMinimumBalance() - vaultManager.minTransactionFee()
			// }
			if(withdrawalAmount > vaultManager.vaultMinimumBalance()) {
				txId = await vaultManager.withdrawALGOs(account, withdrawalAmount)
				console.log('withdrawALGOs: %s', txId)
			}
			await vaultManager.waitForTransactionResponse(txId)
		}
	} catch (err) {
		console.error('ERROR: removing all algos from vault. Tried to withdraw %d', withdrawalAmount)
	}

	let vaultAddr = await vaultManager.readLocalStateByKey(account.addr, vault.VAULT_ACCOUNT_LOCAL_KEY)
	if(vaultAddr) {
		txId = await vaultManager.clearApp(account)
		console.log('clearApp: %s', txId)
	}

	let asaBalance = await vaultManager.assetBalance(account.addr)
	if(asaBalance !== 0) {
		await vaultManager.transferAsset(account, settings.mintAccountAddr, 0, settings.mintAccountAddr)
	}

	txId = await vaultManager.optIn(account)
	console.log('optIn: %s', txId)

	txId = await vaultManager.optInASA(account)
	console.log('optInASA: %s', txId)	

	txId = await vaultManager.setGlobalStatus(adminAccount, 0)
	console.log('setGlobalStatus to 0: %s', txId)

	let txResponse = await vaultManager.waitForTransactionResponse(txId)
	vaultManager.printAppCallDelta(txResponse)

	// it should fail
	try {
		txId = await vaultManager.depositALGOs(account, depositAmount)
		console.error('ERROR: depositALGOs should have failed: %s', txId)
	} catch (err) {
		console.log('depositALGOs successfully failed')
	}

	txId = await vaultManager.setGlobalStatus(adminAccount, 1)
	console.log('setGlobalStatus to 1: %s', txId)
	
	txId = await vaultManager.setAccountStatus(adminAccount, account.addr, 0)
	console.log('setAccountStatus to 0: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)
	vaultManager.printAppCallDelta(txResponse)

	try {
		txId = await vaultManager.depositALGOs(account, depositAmount)
		console.error('ERROR: depositALGOs should have failed: %s', txId)
	} catch (err) {
		console.log('depositALGOs successfully failed')
	}

	txId = await vaultManager.setAccountStatus(adminAccount, account.addr, 1)
	console.log('setAccountStatus to 1: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)
	vaultManager.printAppCallDelta(txResponse)

	txId = await vaultManager.depositALGOs(account, depositAmount)
	console.log('depositALGOs: %s', txId)

	let oldCollectedFees = await vaultManager.adminMintFees()
	txId = await vaultManager.mintwALGOs(account, mintAmount)
	txResponse = await vaultManager.waitForTransactionResponse(txId)

	let newCollectedFees = await vaultManager.adminMintFees()
	let collectedFeesTx = newCollectedFees - oldCollectedFees

	console.log('mintwALGOs: %s Collected fees %d', txId, (collectedFeesTx))
	let correctFees = Math.floor(mintAmount * settings.mintFee / 10000)
	if(collectedFeesTx !== correctFees) {
		console.error('ERROR: Mint fee should be: %d but it was: %d', correctFees, collectedFeesTx)
	}

	txId = await vaultManager.withdrawALGOs(account, withdrawAmount)
	console.log('withdrawALGOs: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	// let withdrawalFee = await vaultManager.vaultWithdrawalFees(account.addr)
	// vaultBalance = await vaultManager.vaultBalance(account.addr)
	
	// console.log('withdrawALGOs: %s Rewards fees %d', txId, (withdrawalFee))
	// correctFees = Math.floor((vaultBalance - depositAmount + withdrawAmount) * settings.withdrawalFee / 10000)
	// if(withdrawalFee !== correctFees) {
	// 	console.error('ERROR: Rewards fee should be: %d but it was: %d', correctFees, withdrawalFee)
	// }

	txId = await vaultManager.burnwALGOs(account, burnAmount)
	console.log('burnwALGOs: %s', txId)
	
	txResponse = await vaultManager.waitForTransactionResponse(txId)

	let deposited = await vaultManager.deposits(account.addr)
	if(deposited != depositAmount) {
		console.error('ERROR: deposited amount should be: %d', depositAmount)
	}
	let withdrew = await vaultManager.withdrawals(account.addr)
	if(withdrew != withdrawAmount) {
		console.error('ERROR: withdrew amount should be: %d', withdrawAmount)
	}
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
		txId = await vaultManager.burnwALGOs(account, mintAmount - burnAmount + 1)
		console.error('ERROR: burnwALGOs should have failed: %s', txId)
	} catch (err) {
		console.log('burnwALGOs successfully failed')
	}

	txId = await vaultManager.burnwALGOs(account, mintAmount - burnAmount)
	console.log('burnwALGOs %s: %s', account.addr, txId)

	try {
		txId = await vaultManager.withdrawALGOs(account, depositAmount - withdrawAmount - 2000 + 1)
		console.error('ERROR: withdrawALGOs should have failed: %s', txId)
	} catch (err) {
		console.log('withdrawALGOs successfully failed')
	}

	txId = await vaultManager.withdrawALGOs(account, depositAmount - withdrawAmount - 2000)
	console.log('withdrawALGOs %s: %s', account.addr, txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	deposited = await vaultManager.deposits(account.addr)
	if(deposited != depositAmount) {
		console.error('ERROR: deposited amount should be: %d', depositAmount)
	}
	withdrew = await vaultManager.withdrawals(account.addr)
	if(withdrew != (depositAmount - 2000)) {
		console.error('ERROR: withdrew amount should be: %d', (depositAmount - withdrawAmount - 2000))
	}
	minted = await vaultManager.mints(account.addr)
	if(minted != 0) {
		console.error('ERROR: deposited amount should be: %d', 0)
	}

	// the vault balance should be very small but above minimum balance (0.1 algos)
	vaultBalance = await vaultManager.vaultBalance(account.addr)
	if(vaultBalance > 200000) {
		console.error('ERROR: vault balance should be very small but it is: %d', vaultBalance)
	}

	txId = await vaultManager.clearApp(account)
	console.log('clearApp %s: %s', account.addr, txId)

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
		// const appId = await vaultManager.deleteApp(adminAccount)
		// console.log('AppId: ' + appId)

		// txId = await vaultManager.createApp(adminAccount)
		// txResponse = await vaultManager.waitForTransactionResponse(txId)
		// appId = vaultManager.appIdFromCreateAppResponse(txResponse)
		// vaultManager.setAppId(appId)
		// console.log('AppId: ' + appId)

		// await vaultManager.optIn(account4)
		txId = await vaultManager.updateApp (adminAccount)
		console.log('updateApp: %s', txId)

		// txResponse = await vaultManager.waitForTransactionResponse(txId)

		txId = await vaultManager.setMintAccount(adminAccount, account1.addr)
		console.log('setMintAccount %s: %s', account1.addr, txId)
		txId = await vaultManager.setAdminAccount(adminAccount, account2.addr)
		console.log('setAdminAccount %s: %s', account2.addr, txId)
		txResponse = await vaultManager.waitForTransactionResponse(txId)

		// use the new admin to set mint account
		txId = await vaultManager.setMintAccount(account2, settings.mintAccountAddr)
		console.log('setMintAccount %s: %s', settings.mintAccountAddr, txId)
		txId = await vaultManager.setGlobalStatus(account2, 1)
		console.log('setGlobalStatus to 1: %s', txId)
		txId = await vaultManager.setAdminAccount(account2, adminAccount.addr)

		// restore admin account
		console.log('setAdminAccount %s: %s', adminAccount.addr, txId)
		txResponse = await vaultManager.waitForTransactionResponse(txId)

		// Reset Rewards Fee
		console.log('Reset Fees')
		txId = await vaultManager.setWithdrawalFee(adminAccount, 0)
		console.log('setWithdrawalFee: %s', txId)

		// Reset Mint Fee 
		txId = await vaultManager.setMintFee(adminAccount, 0)
		console.log('setMintFee: %s', txId)
		
		try {
			txId = await vaultManager.setMintFee(account1, 300)
			console.error('ERROR: setMintFee should have failed non admin account: %s', txId)
	
		} catch (err) {
			console.log('setMintFee successfully failed')
		}

		try {
			txId = await vaultManager.setMintFee(adminAccount, 5001)
			console.error('ERROR: setMintFee should have failed above maximum (5000): %s', txId)
	
		} catch (err) {
			console.log('setMintFee successfully failed')
		}

		try {
			txId = await vaultManager.setWithdrawalFee(account1, 300)
			console.error('ERROR: setWithdrawalFee should have failed non admin account: %s', txId)
	
		} catch (err) {
			console.log('setWithdrawalFee successfully failed')
		}

		try {
			txId = await vaultManager.setWithdrawalFee(adminAccount, 5001)
			console.error('ERROR: setWithdrawalFee should have failed above maximum (5000): %s', txId)
	
		} catch (err) {
			console.log('setWithdrawalFee successfully failed')
		}

		// Rewards Fee
		txId = await vaultManager.setWithdrawalFee(adminAccount, withdrawalFee)
		console.log('setWithdrawalFee: %s', txId)

		// Mint Fee 
		txId = await vaultManager.setMintFee(adminAccount, mintFee)
		console.log('setMintFee: %s', txId)

		txResponse = await vaultManager.waitForTransactionResponse(txId)

		let fee = await vaultManager.withdrawalFee()
		if(fee !== withdrawalFee) {
			console.error('ERROR: Rewards Fee should be %d but it is %d', withdrawalFee, fee)
		}

		fee = await vaultManager.mintFee()
		if(fee !== mintFee) {
			console.error('ERROR: Mint Fee should be %d but it is %d', mintFee, fee)
		}

		await testAccount(account1, 12000405, 4545000, 5500000, 2349000)
		await testAccount(account2, 6000405, 5545000, 450000, 4349000)
		await testAccount(account3, 8000405, 3545000, 4300000, 3349000)
		await testAccount(account4, 9000405, 8545000, 350000, 7349000)
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

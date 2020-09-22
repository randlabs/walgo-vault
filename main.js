const algosdk = require('algosdk')
const asaTools = require('./asa-tools')
const vault = require('./vault')
const config = require('./config')

let algodClient
let vaultAdmin
let account1
let account2
let account3
let account4
let account5
let settings

function recoverManagerAccount () {
	// Private key mnemonic: town memory type rapid ugly aim yard moon rocket lobster survey series mesh plate great seed company vote debris limb view motion label absorb swear

	// WALBWVI43IKS7YJJADD7WGE4C4TS3OTOJOEAVEWNXEJS6CXH7OJIVKKHME
	//  const passphrase = 'clay vast only enact sibling axis seven around drip cruise era alcohol police web planet increase winter exclude rain pyramid art alert tool absent pave'
	//  return myAccount

	// const myAccount = algosdk.mnemonicToSecretKey(passphrase)
	vaultAdmin = algosdk.mnemonicToSecretKey(settings.managerAccount.privateKey)
	account1 = algosdk.mnemonicToSecretKey(settings.account1.privateKey)
	account2 = algosdk.mnemonicToSecretKey(settings.account2.privateKey)
	account3 = algosdk.mnemonicToSecretKey(settings.account3.privateKey)
	account4 = algosdk.mnemonicToSecretKey(settings.account4.privateKey)
	account5 = algosdk.mnemonicToSecretKey(settings.account5.privateKey)
}

async function setupClient () {
	if (algodClient == null) {
		algodClient = new algosdk.Algodv2(settings.algodClient.apiToken, settings.algodClient.server, settings.algodClient.port)

		const appId = 2671848

		vaultManager = new vault.VaultManager(algodClient, appId, vaultAdmin.addr, settings.assetId)
	} else {
		return algodClient
	}

	return algodClient
}

async function testAccount(account, depositAmount, mintAmount, withdrawAmount, burnAmount) {
	console.log('Testing account %s', account.addr)

	let txId
	let amount

	try {		
		let vaultBalance = await vaultManager.vaultBalance(account.addr)
		if(vaultBalance > 100000) {
			amount = vaultBalance - 100000 - 1000
			// just in case it did not opt In
			let vaultAddr = await vaultManager.readLocalStateByKey(account.addr, vault.VAULT_ACCOUNT_LOCAL_KEY)
			if(!vaultAddr) {
				txId = await vaultManager.optIn(account)
				await vaultManager.waitForTransactionResponse(txId)
			}
			else {
				amount = await vaultManager.readLocalStateByKey(account.addr, vault.MINTED_LOCAL_KEY)
				if(amount) {
					txId = await vaultManager.burnwALGOs(account, amount)
					//await vaultManager.waitForTransactionResponse(txId)
				}
			}

			txId = await vaultManager.withdrawALGOs(account, vaultBalance - 100000 - 1000)
			console.log('withdrawALGOs: %s', txId)
			await vaultManager.waitForTransactionResponse(txId)
		}
	} catch (err) {
		console.error('ERROR: removing all algos from vault. Tried to withdraw %d', amount)
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

	txId = await vaultManager.setGlobalStatus(vaultAdmin, 0)
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

	txId = await vaultManager.setGlobalStatus(vaultAdmin, 1)
	console.log('setGlobalStatus to 1: %s', txId)
	
	txId = await vaultManager.setAccountStatus(vaultAdmin, account.addr, 0)
	console.log('setAccountStatus to 0: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)
	vaultManager.printAppCallDelta(txResponse)

	try {
		txId = await vaultManager.depositALGOs(account, depositAmount)
		console.error('ERROR: depositALGOs should have failed: %s', txId)
	} catch (err) {
		console.log('depositALGOs successfully failed')
	}

	txId = await vaultManager.setAccountStatus(vaultAdmin, account.addr, 1)
	console.log('setAccountStatus to 1: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)
	vaultManager.printAppCallDelta(txResponse)

	tatxId = await vaultManager.depositALGOs(account, depositAmount)
	console.log('depositALGOs: %s', txId)

	txId = await vaultManager.mintwALGOs(account, mintAmount)
	console.log('mintwALGOs: %s', txId)

	txId = await vaultManager.withdrawALGOs(account, withdrawAmount)
	console.log('withdrawALGOs: %s', txId)

	txId = await vaultManager.burnwALGOs(account, burnAmount)
	console.log('burnwALGOs: %s', txId)
	
	txResponse = await vaultManager.waitForTransactionResponse(txId)

	let deposited = await vaultManager.readLocalStateByKey(account.addr, vault.DEPOSITED_LOCAL_KEY)
	if(deposited != depositAmount) {
		console.error('ERROR: deposited amount should be: %d', depositAmount)
	}
	let withdrew = await vaultManager.readLocalStateByKey(account.addr, vault.WITHDREW_LOCAL_KEY)
	if(withdrew != withdrawAmount) {
		console.error('ERROR: withdrew amount should be: %d', withdrawAmount)
	}
	let minted = await vaultManager.readLocalStateByKey(account.addr, vault.MINTED_LOCAL_KEY)
	if(minted != (mintAmount - burnAmount)) {
		console.error('ERROR: minted amount should be: %d', (mintAmount - burnAmount))
	}

	console.log('\nApp Status')
	await vaultManager.printGlobalState(vaultAdmin.addr)
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

	deposited = await vaultManager.readLocalStateByKey(account.addr, vault.DEPOSITED_LOCAL_KEY)
	if(deposited != depositAmount) {
		console.error('ERROR: deposited amount should be: %d', depositAmount)
	}
	withdrew = await vaultManager.readLocalStateByKey(account.addr, vault.WITHDREW_LOCAL_KEY)
	if(withdrew != (depositAmount - 2000)) {
		console.error('ERROR: withdrew amount should be: %d', (depositAmount - withdrawAmount - 2000))
	}
	minted = await vaultManager.readLocalStateByKey(account.addr, vault.MINTED_LOCAL_KEY)
	if(minted != 0) {
		console.error('ERROR: deposited amount should be: %d', 0)
	}

	// the vault balance should be very small but above minimum balance (0.1 algos)
	let vaultBalance = await vaultManager.vaultBalance(account.addr)
	if(vaultBalance > 200000) {
		console.error('ERROR: vault balance should be very small but it is: %d', vaultBalance)
	}

	txId = await vaultManager.clearApp(account)
	console.log('clearApp %s: %s', account.addr, txId)

	console.log('Success!!!')
}

async function main () {
	try {
		// let txId

		// await vaultManager.printLocalState(account2.addr)

		// txId = await vaultManager.withdrawALGOs(account2, 18398532)
		// console.log('withdrawALGOs %s: %s', account2.addr, txId)

		// let txRet = await vaultManager.waitForTransactionResponse(txId)
		// vaultManager.printAppCallDelta(txRet)

		// await vaultManager.printLocalState(account2.addr)

		// return

		// const appId = await vaultManager.createApp(managerAccount)
		// console.log('AppId: ' + appId)

		// await vaultManager.optIn(account4)
		txId = await vaultManager.updateApp (vaultAdmin)
		console.log('updateApp: %s', txId)

		txId = await vaultManager.setMintAccount(vaultAdmin, account1.addr)
		console.log('setMintAccount %s: %s', account1.addr, txId)
		txId = await vaultManager.setMintAccount(vaultAdmin, settings.mintAccountAddr)
		console.log('setMintAccount %s: %s', settings.mintAccountAddr, txId)
		txId = await vaultManager.setGlobalStatus(vaultAdmin, 1)
		console.log('setGlobalStatus to 1: %s', txId)

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

		// txId = await vaultManager.setAccountStatus(vaultAdmin, account2.addr, 0)
		// console.log('setAccountStatus %s to 0: %s', account2.addr, txId)

		txId = await vaultManager.setGlobalStatus(vaultAdmin, 0)
		console.log('setGlobalStatus to 0: %s', txId)

		let txResponse = await vaultManager.waitForTransactionResponse(txId)
		vaultManager.printAppCallDelta(txResponse)
		// it should fail
		try {
			txId = await vaultManager.registerVault(account2)
			console.log('ERROR: registerVault should have failed %s: %s', account2.addr, txId)
	
		} catch (err) {
			console.log('Register successfully failed')
		}

		txId = await vaultManager.setGlobalStatus(vaultAdmin, 1)
		console.log('setGlobalStatus to 1: %s', txId)
		
		// txId = await vaultManager.setAccountStatus(vaultAdmin, account2.addr, 1)
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
		await vaultManager.printGlobalState(vaultAdmin.addr)
		await vaultManager.printLocalState(vaultAdmin.addr)
		await vaultManager.printLocalState(account1.addr)
		await vaultManager.printLocalState(account2.addr)
		await vaultManager.printLocalState(account3.addr)
		await vaultManager.printLocalState(account4.addr)
		await vaultManager.printLocalState(account5.addr)

		console.log('Success!!!')
	} catch (err) {
		let text = err.error

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

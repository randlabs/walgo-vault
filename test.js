const algosdk = require('algosdk')
const asaTools = require('./asa-tools')
const vault = require('./vault')
const config = require('./config')
const fs = require('fs')

let settings
let burnFee = 150
let mintFee = 200
let creationFee = 550000
let fakeAssetId
let fakeAppId

let signatures = {}
let addresses
let algodClient
let mintAddr
let clearStateAttackAddr

const testApprovalProgramFilename = 'true-program.teal'
const testClearStateProgramFilename = 'true-program.teal'

function setupClient() {
	algodClient = settings.algodClient
	signatures = settings.signatures
	addresses = settings.addresses
	mintAddr = settings.minterAddress
	clearStateAttackAddr = settings.clearStateAttackAddr

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
	if(settings.fakeAssetId) {
		fakeAssetId = settings.fakeAssetId
	}
	if(settings.fakeAppId) {
		fakeAppId = settings.fakeAppId
	}
}

function errorText(err) {
	let text =  err.error

	if (err.text) {
		if(err.text.message) {
			text == err.text.message
		}
		else {
			text = err.text
		}
	}
	else if (err.message) {
		text = err.message
	}
	return text
}

function signCallback(sender, tx) {
	const txSigned = tx.signTxn(signatures[sender].sk)
	return txSigned
}

function lsigCallback(sender, lsig) {
	lsig.sign(signatures[sender].sk)
}

async function testAccount(accountAddr, depositAmount, mintAmount, withdrawAmount, burnAmount) {
	console.log('\n********* Testing account %s *********\n', accountAddr)

	let txId
	let vaultBalance
	let withdrawalAmount
	let minted
	let txResponse
	let curBurnFee

	try {	
		console.log('minted')
		minted = await vaultManager.minted(accountAddr)
		console.log('vaultBalance')
		vaultBalance = await vaultManager.vaultBalance(accountAddr)
		if(vaultBalance > vaultManager.minVaultBalance() || minted > 0) {
			withdrawalAmount = vaultBalance - vaultManager.minVaultBalance() - vaultManager.minTransactionFee()
			// just in case it did not opt In
			console.log('vaultAddressByApp')
			let vaultAddr = await vaultManager.vaultAddressByApp(accountAddr)
			if(!vaultAddr) {
				vaultAddr = await vaultManager.vaultAddressByTEAL(accountAddr)
				console.error('Cannot use account %s becuase the Vault %s has a balance != 0', accountAddr, vaultAddr)
				return
			}
			else {
				console.log('setAccountStatus')
				txId = await vaultManager.setAccountStatus(addresses[0], accountAddr, 1, signCallback)
				await vaultManager.waitForTransactionResponse(txId)

				if(minted) {
					// just in case it does not have enough balance to pay fees
					curBurnFee = await vaultManager.burnFee()
					txId = await vaultManager.depositALGOs(accountAddr, Math.ceil(minted*curBurnFee/10000) + vaultManager.minTransactionFee(), signCallback)
					await vaultManager.waitForTransactionResponse(txId)

					console.log('burnwALGOs')
					txId = await vaultManager.burnwALGOs(accountAddr, Math.floor(minted), signCallback)
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
			txId = await vaultManager.closeOut(accountAddr, signCallback)
			console.log('closeOut: %s', txId)
		}
		else if(vaultAddrApp) {
			console.log('Vault TEAL changed: can not make a ClouseOut so call clearApp')
			txId = await vaultManager.clearApp(accountAddr, signCallback)
			console.log('clearApp: %s', txId)
		}
	} catch (err) {
		console.error('ERROR: rolling back vault: %s', errorText(err))
	}

	let vaultAddrApp = await vaultManager.vaultAddressByApp(clearStateAttackAddr)
	let vaultAddrTEAL = await vaultManager.vaultAddressByTEAL(clearStateAttackAddr)
	if(vaultAddrApp == vaultAddrTEAL) {
		console.log('closeOut')
		txId = await vaultManager.closeOut(clearStateAttackAddr, signCallback)
		console.log('closeOut: %s', txId)
	}

	console.log('assetBalance')
	let asaBalance = await vaultManager.assetBalance(accountAddr)
	if(asaBalance !== 0) {
		txId = await vaultManager.transferAsset(accountAddr, mintAddr, 0, mintAddr, signCallback)
		console.log('transferAsset: %s', txId)
	}

	console.log('assetBalance Fake asset')
	asaBalance = await vaultManager.assetBalance(accountAddr, fakeAssetId)
	if(asaBalance !== 0) {
		txId = await vaultManager.transferAsset(accountAddr, mintAddr, 0, mintAddr, signCallback, fakeAssetId)
		console.log('transferAsset Fake: %s', txId)
	}

	try {
		console.log('optIn: try optIn paying less fees')
		// try to send 2 txs in a group to withdraw algos from a user vault from the Admin
		txId = await vaultManager.optIn(accountAddr, signCallback, creationFee-1)
		console.error('ERROR: optIn should have failed fees less than creationFee: %s', txId)
	} catch (err) {
		console.log('optIn should have failed fees less than creationFee: %s', errorText(err))
	}

	try {
		console.log('optIn: try optIn paying fees to an incorrect account')
		// try to send 2 txs in a group to withdraw algos from a user vault from the Admin
		txId = await vaultManager.optIn(accountAddr, signCallback, undefined, addresses[1])
		console.error('ERROR: optIn should have failed fees paid to incorrect account: %s', txId)
	} catch (err) {
		console.log('optIn should have failed fees paid to incorrect account: %s', errorText(err))
	}

	console.log('optIn')
	txId = await vaultManager.optIn(accountAddr, signCallback)
	console.log('optIn: %s', txId)

	console.log('optInASA')
	txId = await vaultManager.optInASA(accountAddr, signCallback)
	console.log('optInASA: %s', txId)	

	console.log('optInASA Fake')
	txId = await vaultManager.optInASA(accountAddr, signCallback, fakeAssetId)
	console.log('optInASA Fake: %s', txId)	

	console.log('transfer Fake asset to try to cheat')
	txId = await vaultManager.transferAsset(mintAddr, accountAddr, mintAmount, undefined, signCallback, fakeAssetId)
	console.log('transferAsset Fake: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	// Audit attack. Deposit 2000 malgos, mint 2000 microwalgos and burn 1 microwalgo paying the fee from the vault. Ends with 1999 microwalgos minted
	// and the Vault with 1000 microalgos balance
	console.log('depositALGOs Burn Fee attack')
	txId = await vaultManager.depositALGOs(accountAddr, 202000, signCallback)
	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('mintwALGOs: Burn Fee attack')
	maxMintAmount = await vaultManager.maxMintAmount(accountAddr)
	txId = await vaultManager.mintwALGOs(accountAddr, maxMintAmount, signCallback)
	txResponse = await vaultManager.waitForTransactionResponse(txId)

	try {
		console.log('burnwALGOs Burn Fee attack: burn operation does not take into account fees paid from Vault')
		txId = await vaultManager.burnwALGOs(accountAddr, 1, signCallback)
		console.error('ERROR: burnwALGOs should have failed it burn operation does not take into account fees paid from Vault: %s', txId)
	} catch (err) {
		console.log('burnwALGOs successfully failed burn operation does not take into account fees paid from Vault: %s', errorText(err))
	}

	// rollback
	txId = await vaultManager.burnwALGOs(accountAddr, maxMintAmount, signCallback)
	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('setGlobalStatus')
	txId = await vaultManager.setGlobalStatus(addresses[0], 0, signCallback)
	console.log('setGlobalStatus to 0: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('printAppCallDelta')
	vaultManager.printAppCallDelta(txResponse)

	// deposit algos can be always done because it does not interact with the App
	console.log('depositALGOs')
	txId = await vaultManager.depositALGOs(accountAddr, depositAmount, signCallback)

	// it should fail: GlobalStatus == 0
	try {
		console.log('withdrawALGOs')
		txId = await vaultManager.withdrawALGOs(accountAddr, withdrawAmount, signCallback)
		console.error('ERROR: withdrawALGOs should have failed GlobalStatus == 0: %s', txId)
	} catch (err) {
		console.log('withdrawALGOs successfully failed GlobalStatus == 0: %s', errorText(err))
	}

	try {
		console.log('setGlobalStatus: try incorrect number')
		txId = await vaultManager.setGlobalStatus(addresses[0], 2, signCallback)
		console.error('setGlobalStatus: should have failed, incorrect argument: %s', txId)
	} catch (err) {
		console.log('setGlobalStatus successfully failed incorrect argument: %s', errorText(err))
	}


	console.log('setGlobalStatus')
	txId = await vaultManager.setGlobalStatus(addresses[0], 1, signCallback)
	console.log('setGlobalStatus to 1: %s', txId)

	try {
		console.log('setAccountStatus: try incorrect number')
		txId = await vaultManager.setAccountStatus(addresses[0], accountAddr, 10, signCallback)
		console.error('setAccountStatus: should have failed, incorrect argument: %s', txId)
	} catch (err) {
		console.log('setAccountStatus successfully failed incorrect argument: %s', errorText(err))
	}

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
		console.log('withdrawALGOs successfully failed AccountStatus == 0: %s', errorText(err))
	}

	console.log('setAccountStatus')
	txId = await vaultManager.setAccountStatus(addresses[0], accountAddr, 1, signCallback)
	console.log('setAccountStatus to 1: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('printAppCallDelta')
	vaultManager.printAppCallDelta(txResponse)

	console.log('optIn clearStateAttackAddr')
	txId = await vaultManager.optIn(clearStateAttackAddr, signCallback)
	console.log('optIn clearStateAttackAddr: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	try {
		console.log('clearStateAttack')
		// try to send 2 txs in a group to drain algos from a Vault creating a clearState from the sender and 
		// withdrawing algos from a Vault that the sender does not own.
		txId = await vaultManager.clearStateAttack(clearStateAttackAddr, accountAddr, 100000, signCallback)
		console.error('ERROR: clearStateAttack should have failed: %s', txId)
	} catch (err) {
		console.log('clearStateAttack successfully failed: %s', errorText(err))

		console.log('closeOut clearStateAttackAddr')
		txId = await vaultManager.closeOut(clearStateAttackAddr, signCallback)
		console.log('closeOut clearStateAttackAddr: %s', txId)
	}

	try {
		console.log('setMintAccountAttack')
		// try to send 2 txs in a group to withdraw algos from a Vault using admin account 
		txId = await vaultManager.setMintAccountAttack(addresses[0], mintAddr, accountAddr, signCallback)
		console.error('ERROR: setMintAccountAttack should have failed: %s', txId)
	} catch (err) {
		console.log('setMintAccountAttack successfully failed: %s', errorText(err))
	}

	try {
		console.log('updateAppAttack')
		// try to update the app doing an user op with the correct arguments. Reported by Audit.
		txId = await vaultManager.updateAppAttack(accountAddr, 10000, signCallback)

		console.error('ERROR: updateAppAttack should have failed: %s', txId)
	} catch (err) {
		console.log('updateAppAttack successfully failed: %s', errorText(err))
	}

	try {
		console.log('mintwALGOs: try to mint another asset')
		txId = await vaultManager.mintwALGOs(accountAddr, mintAmount, signCallback, undefined, fakeAssetId)
		console.error('ERROR: mintwALGOs should have failed incorrect asset: %s', txId)
	} catch (err) {
		console.log('mintwALGOs successfully failed: incorrect asset: %s', errorText(err))
	}

	console.log('mintwALGOs')
	txId = await vaultManager.mintwALGOs(accountAddr, Math.floor(mintAmount/2), signCallback)
	console.log('mintwALGOs: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('mintFee')
	let mintFee = await vaultManager.mintFee()

	// remove mint fee to test GroupSize == 2
	txId = await vaultManager.setMintFee(addresses[0], 0, signCallback)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('mintwALGOs')
	txId = await vaultManager.mintwALGOs(accountAddr, mintAmount - Math.floor(mintAmount/2), signCallback)
	console.log('mintwALGOs: %s', txId)

	txId = await vaultManager.setMintFee(addresses[0], mintFee, signCallback)
	txResponse = await vaultManager.waitForTransactionResponse(txId)

	let maxWithdrawAmount = await vaultManager.maxWithdrawAmount(accountAddr)
	try {
		console.log('withdrawALGOs: try to withdraw more than allowed')
		txId = await vaultManager.withdrawALGOs(accountAddr, maxWithdrawAmount + 100000, signCallback)
		console.error('ERROR: withdrawALGOs should have failed amount exceeds maximum: %s', txId)
	} catch (err) {
		console.log('withdrawALGOs successfully failed: amount exceeds maximum: %s', errorText(err))
	}

	console.log('withdrawALGOs')
	txId = await vaultManager.withdrawALGOs(accountAddr, withdrawAmount, signCallback)
	console.log('withdrawALGOs: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	maxMintAmount = await vaultManager.maxMintAmount(accountAddr)

	try {
		console.log('mintwALGOs: try to mint more than allowed')
		txId = await vaultManager.mintwALGOs(accountAddr, maxMintAmount + 1, signCallback)
		console.error('ERROR: mintwALGOs should have failed amount exceeds maximum: %s', txId)
	} catch (err) {
		console.log('mintwALGOs successfully failed: amount exceeds maximum: %s', errorText(err))
	}

	try {
		console.log('mintwALGOs: try to mint a different app id')
		txId = await vaultManager.mintwALGOs(accountAddr, maxMintAmount, signCallback, fakeAppId)
		console.error('ERROR: mintwALGOs should have failed different app id: %s', txId)
	} catch (err) {
		console.log('mintwALGOs successfully failed: different app id: %s', errorText(err))
	}

	try {
		console.log('burnwALGOs: more than minted')
		txId = await vaultManager.burnwALGOs(accountAddr, mintAmount+1, signCallback)
		console.error('ERROR: burnwALGOs should have failed burnAmount greater than minted: %s', txId)
	} catch (err) {
		console.log('burnwALGOs successfully failed burnAmount greater than minted: %s', errorText(err))
	}

	try {
		console.log('burnwALGOs: incorrect asset')
		txId = await vaultManager.burnwALGOs(accountAddr, Math.floor(mintAmount/4), signCallback, fakeAssetId)
		console.error('ERROR: burnwALGOs should have failed incorrect asset: %s', txId)
	} catch (err) {
		console.log('burnwALGOs successfully failed incorrect asset: %s', errorText(err))
	}

	console.log('minted pre maxMintAmount')
	minted = await vaultManager.minted(accountAddr)
	console.log('Net minted pre maxMintAmount: %d', minted)

	console.log('mintwALGOs maxMintAmount')
	txId = await vaultManager.mintwALGOs(accountAddr, maxMintAmount, signCallback)
	console.log('mintwALGOs maxMintAmount: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	let mintedPost = await vaultManager.minted(accountAddr)
	if(mintedPost !== (minted + maxMintAmount)) {
		console.error('ERROR: Net minted maxMintAmount should be %d but it is %d', minted + maxMintAmount, mintedPost)
	}

	console.log('burnwALGOs rollback maxBurnAmount')
	txId = await vaultManager.burnwALGOs(accountAddr, maxMintAmount, signCallback)
	console.log('burnwALGOs rollback maxBurnAmount: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	mintedPost = await vaultManager.minted(accountAddr)
	if(mintedPost !== minted) {
		console.error('ERROR: Net minted maxMintAmount should go back to %d but it is %d', minted, mintedPost)
	}

	try {
		console.log('burnwALGOsAttack: burn algos from Minter account intead of user')
		txId = await vaultManager.burnwALGOsAttack(accountAddr, Math.floor(burnAmount/2), signCallback)
		console.error('ERROR: burnwALGOsAttack should have failed Minter was the Sender: %s', txId)
	} catch (err) {
		console.log('burnwALGOsAttack successfully failed Minter was the Sender: %s', errorText(err))
	}

	console.log('burnwALGOs with Fee')
	txId = await vaultManager.burnwALGOs(accountAddr, Math.floor(burnAmount/2), signCallback)
	console.log('burnwALGOs: %s', txId)

	curBurnFee = await vaultManager.burnFee()
	txId = await vaultManager.setBurnFee(addresses[0], 0, signCallback)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	try {
		console.log('burnwALGOs: more than minted with no fee')
		txId = await vaultManager.burnwALGOs(accountAddr, mintAmount - Math.floor(burnAmount/2) + 1, signCallback)
		console.error('ERROR: burnwALGOs should have failed burnAmount greater than minted: %s', txId)
	} catch (err) {
		console.log('burnwALGOs successfully failed burnAmount greater than minted no fee: %s', errorText(err))
	}

	console.log('burnwALGOs no Fee')
	txId = await vaultManager.burnwALGOs(accountAddr, burnAmount - Math.floor(burnAmount/2), signCallback)
	console.log('burnwALGOs: %s', txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	txId = await vaultManager.setBurnFee(addresses[0], curBurnFee, signCallback)
	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('minted')
	minted = await vaultManager.minted(accountAddr)
	console.log('Net minted: %d', minted)
	if(minted !== (mintAmount - burnAmount)) {
		console.error('ERROR: Net minted should be %d but it is %d', mintAmount - burnAmount, minted)
	}

	console.log('minted')
	minted = await vaultManager.minted(accountAddr)
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
		console.log('burnwALGOs successfully failed: %s', errorText(err))
	}

	let restoreAmount = await vaultManager.maxWithdrawAmount(accountAddr)
	try {
		console.log('withdrawALGOs')
		txId = await vaultManager.withdrawALGOs(accountAddr, restoreAmount + 1, signCallback)
		console.error('ERROR: withdrawALGOs should have failed amount exceeds maximum: %s', txId)
	} catch (err) {
		console.log('withdrawALGOs successfully failed: amount exceeds maximum: %s', errorText(err))
	}

	console.log('burnwALGOs')
	txId = await vaultManager.burnwALGOs(accountAddr, mintAmount - burnAmount, signCallback)
	console.log('burnwALGOs %s: %s', accountAddr, txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	restoreAmount = await vaultManager.maxWithdrawAmount(accountAddr)

	console.log('withdrawALGOs')
	txId = await vaultManager.withdrawALGOs(accountAddr, restoreAmount, signCallback)
	console.log('withdrawALGOs %s: %s', accountAddr, txId)

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	restoreAmount = await vaultManager.maxWithdrawAmount(accountAddr)

	if(restoreAmount > 0) {
		try {
			console.log('withdrawALGOs')
			txId = await vaultManager.withdrawALGOs(accountAddr, restoreAmount + 1, signCallback)
			console.error('ERROR: withdrawALGOs should have failed amount exceeds maximum: %s', txId)
		} catch (err) {
			console.log('withdrawALGOs successfully failed: amount exceeds maximum: %s', errorText(err))
		}
	
		console.log('withdrawALGOs')
		txId = await vaultManager.withdrawALGOs(accountAddr, restoreAmount, signCallback)
		console.log('withdrawALGOs %s: %s', accountAddr, txId)
	}

	txResponse = await vaultManager.waitForTransactionResponse(txId)

	console.log('minted')
	minted = await vaultManager.minted(accountAddr)
	if(minted != 0) {
		console.error('ERROR: minted amount should be: 0')
	}

	console.log('fake asset optOut')
	txId = await vaultManager.transferAsset(accountAddr, mintAddr, mintAmount, mintAddr, signCallback, fakeAssetId)
	console.log('fake asset optOut %s', txId)

	console.log('CloseOut')
	txId = await vaultManager.closeOut(accountAddr, signCallback)
	console.log('CloseOut: %s', txId)

	console.log('Success!!!\n')
}

async function main () {
	let errText
	try {
		let txId
		let txResponse

		// txId = await vaultManager.optInASA(addresses[7], signCallback)

		// txId = await asaTools.destroyASA(algodClient, addresses[0], 2685690, signCallback);
		// txResponse = await vaultManager.waitForTransactionResponse(txId)
		// console.log('Asset destroyed at round %d', txResponse['confirmed-round'])
		// return
		
		// // ASA ID Testnet: 11870752
		if(settings.createASA) {
			txId = await asaTools.createASA(algodClient, mintAddr, 8000000000000000, 6, 'wALGO', 'Wrapped ALGO', 'https://stakerdao.com', signCallback);
			txResponse = await vaultManager.waitForTransactionResponse(txId)
			settings.assetId = txResponse['asset-index']
			vaultManager.setAssetId(settings.assetId)
			console.log('Asset created with index %d', settings.assetId)
		}

		txId = await asaTools.createASA(algodClient, mintAddr, 8000000000000000, 6, 'wALGOF', 'Wrapped ALGO Fake', 'https://stakerdao.com', signCallback);
		txResponse = await vaultManager.waitForTransactionResponse(txId)
		fakeAssetId = txResponse['asset-index']
		console.log('Asset created with index %d', fakeAssetId)

		if(settings.createApp) {
			console.log('createApp')
			txId = await vaultManager.createApp(addresses[0], signCallback)
			txResponse = await vaultManager.waitForTransactionResponse(txId)
			let appId = vaultManager.appIdFromCreateAppResponse(txResponse)
			vaultManager.setAppId(appId)
			console.log('Create App: AppId: ' + appId)
			
			console.log('initializeApp')
			txId = await vaultManager.initializeApp(addresses[0], signCallback)
			console.log('initializeApp: %s', txId)	
		}

		console.log('createApp: Fake to test')
		txId = await vaultManager.createApp(addresses[0], signCallback, testApprovalProgramFilename, testClearStateProgramFilename)
		txResponse = await vaultManager.waitForTransactionResponse(txId)

		fakeAppId = vaultManager.appIdFromCreateAppResponse(txResponse)
		console.log('Create App: AppId: ' + fakeAppId)

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

		await vaultManager.createDelegatedMintAccountToFile(settings.minterDelegateFile, lsigCallback)
		vaultManager.delegateMintAccountFromFile(settings.minterDelegateFile)

		// optIn minterAddr if did not optIn
		let balance = await vaultManager.assetBalance(mintAddr)
		if(balance === 0) {
			console.log('optInASA')
			txId = await vaultManager.optInASA(mintAddr, signCallback)
			console.log('optInASA: %s', txId)	
			txResponse = await vaultManager.waitForTransactionResponse(txId)
		}
		if(balance < 1000000000000) {
			console.log('transferAsset')
			txId = await vaultManager.transferAsset(addresses[0], mintAddr, 1000000000000, undefined, signCallback)
			console.log('transferAsset: %s', txId)
		}
	
		// Can not optIn with Admin account
		try {
			console.log('optIn')
			txId = await vaultManager.optIn(addresses[0], signCallback)
			console.log('optIn: %s', txId)
		} catch(err) {
			console.log('optIn: successfully failed Admin account cannot optIn %s', errorText(err))
		}

		try {
			console.log('setMintFee: should fail')
			txId = await vaultManager.setMintFee(addresses[2], 300, signCallback)
			console.error('ERROR: setMintFee should have failed non admin account: %s', txId)
	
		} catch (err) {
			console.log('setMintFee successfully failed: %s', errorText(err))
		}

		try {
			console.log('setMintFee: should fail')
			txId = await vaultManager.setMintFee(addresses[0], 5001, signCallback)
			console.error('ERROR: setMintFee should have failed above maximum (5000): %s', txId)
	
		} catch (err) {
			console.log('setMintFee successfully failed: %s', errorText(err))
		}

		try {
			console.log('setBurnFee: should fail')
			txId = await vaultManager.setBurnFee(addresses[1], 300, signCallback)
			console.error('ERROR: setBurnFee should have failed non admin account: %s', txId)
	
		} catch (err) {
			console.log('setBurnFee successfully failed: %s', errorText(err))
		}

		try {
			console.log('setBurnFee: should fail')
			txId = await vaultManager.setBurnFee(addresses[0], 5001, signCallback)
			console.error('ERROR: setBurnFee should have failed above maximum (5000): %s', txId)
	
		} catch (err) {
			console.log('setBurnFee successfully failed: %s', errorText(err))
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
			console.log('setCreationFee successfully failed: %s', errorText(err))
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
				const params = await algodClient.getTransactionParams().do()
				params.fee = vaultManager.minFee
				params.flatFee = true

				let txPay = algosdk.makePaymentTxnWithSuggestedParams(addresses[1], vaultAddr, 110000, undefined, new Uint8Array(0), params)
				let txSigned = signCallback(addresses[1], txPay)
				let tx = (await algodClient.sendRawTransaction(txSigned).do())
				txPay = algosdk.makePaymentTxnWithSuggestedParams(addresses[1], addresses[6], 110000, undefined, new Uint8Array(0), params)
				txSigned = signCallback(addresses[1], txPay)
				tx = (await algodClient.sendRawTransaction(txSigned).do())
				await vaultManager.waitForTransactionResponse(tx.txId)
			}

			try {
				txId = await vaultManager.optIn(addresses[6], signCallback)
				console.error('Error: optIn to non-zero balance Vault should fail Account %s Vault %s txId %s', addresses[6], vaultAddr, txId)
			} catch (err) {
				console.log('optIn to non-zero balance Vault successfully failed: %s', errorText(err))
			}
		}

		await testAccount(addresses[1], 12000405, 4545000, 5500000, 2349000)
		await testAccount(addresses[2], 6000405, 5545000, 300000, 4349000)
		await testAccount(addresses[3], 8000405, 3545000, 4300000, 3349000)
		await testAccount(addresses[4], 9000405, 8545000, 325230, 7349000)
		await testAccount(addresses[5], 4000405, 3900405, 4500, 3900000)

	} catch (err) {
		errText = errorText(err)
	}

	try {
		if(settings.createApp) {
			console.log('deleteApp')
			txId = await vaultManager.deleteApp(addresses[0], signCallback)
			console.log('deleteApp: %s', txId)
		}
	} catch(err) {
		console.error('ERROR: deleteApp failed: %s', errorText(err))
	}

	try {
		if(fakeAppId) {
			console.log('deleteApp: Fake App')
			txId = await vaultManager.deleteApp(addresses[0], signCallback, fakeAppId)
			console.log('deleteApp: Fake App %s', txId)
		}
	} catch(err) {
		console.error('ERROR: deleteApp Fake App failed: %s', errorText(err))
	}
	
	try {
		if(settings.createASA) {
			txId = await asaTools.destroyASA(algodClient, mintAddr, settings.assetId, signCallback);
			console.log('destroyASA: %s', txId)
		}
	} catch(err) {
		console.error('ERROR: destroyASA failed: %s', errorText(err))
	}

	try {
		if(fakeAssetId) {
			txId = await asaTools.destroyASA(algodClient, mintAddr, fakeAssetId, signCallback);
			console.log('destroyASA: Fake Asset %s', txId)
		}
	} catch(err) {
		console.error('ERROR: destroyASA Fake Asset failed: %s', errorText(err))
	}

	if(errText) {
		throw new Error('ERROR: ' + errText)
	}
}

settings = config.initialize()

setupClient()
main()

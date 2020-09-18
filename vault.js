const algosdk = require('algosdk')
const fs = require('fs')
const tools = require('./tools')
const { Console } = require('console');

const approvalProgramFilename = 'app-vault.teal'
const clearProgramFilename = 'app-vault-opt-out.teal'

const MINT_ACCOUNT_GLOBAL_KEY = 'MintAccount'
const VAULT_ACCOUNT_LOCAL_KEY = 'vault'

const DEPOSIT_ALGOS_OP = 'deposit-algos'
const MINT_WALGOS_OP = 'mint-walgos'
const WITHDRAW_ALGOS_OP = 'withdraw-algos'
const BURN_ALGOS_OP = 'burn-walgos'

const REGISTER_OP = 'register'
const SET_STATUS_OP = 'status'
const SET_GLOBAL_STATUS_OP = 'global-status'
const SET_MINT_ACCOUNT_OP = 'mint-account'

var vaultTEAL = 
`#pragma version 2
txn Receiver 
addr TMPL_USER_ADDRESS
==

global GroupSize
int 2
>=
&&

// Application Call
gtxn 0 TypeEnum
int 6
==
&&

gtxn 0 ApplicationID // betanet
int TMPL_APP_ID
==
&&
`
var minterTEAL = 
`#pragma version 2
int 1
return
`

class VaultManager {
	constructor (algodClient, appId = 0, creatorAddr = undefined, assetId = 0) {
		this.algodClient = algodClient
		this.appId = appId
		this.creatorAddr = creatorAddr
		this.assetId = assetId
		this.algodClient = algodClient

		this.setAppId = function (appId) {
			this.appId = appId
		}
		this.setCreator = function (creatorAddr) {
			this.creatorAddr = creatorAddr
		}

		this.readLocalState = async function (accountAddr) {
			return tools.readAppLocalState(this.algodClient, this.appId, accountAddr)
		}

		this.readGlobalState = async function (accountAddr) {
			return tools.readAppGlobalState(this.algodClient, this.appId, accountAddr)
		}

		this.printLocalState = async function (accountAddr) {
			await tools.printAppLocalState(this.algodClient, this.appId, accountAddr)
		}

		this.printGlobalState = async function (accountAddr) {
			await tools.printAppGlobalState(this.algodClient, this.appId, accountAddr)
		}

		this.readLocalStateByKey = async function (accountAddr, key) {
			await tools.readAppLocalStateByKey(this.algodClient, this.appId, accountAddr, key)
		}

		this.readGlobalStateByKey = async function (accountAddr, key) {
			await tools.readAppGlobalStateByKey(this.algodClient, this.appId, accountAddr, key)
		}

		// helper function to await transaction confirmation
		// Function used to wait for a tx confirmation
		this.waitForConfirmation = async function (txId) {
			const status = (await this.algodClient.status().do())
			let lastRound = status['last-round']
			while (true) {
				const pendingInfo = await this.algodClient.pendingTransactionInformation(txId).do()
				if (pendingInfo['confirmed-round'] !== null && pendingInfo['confirmed-round'] > 0) {
					// Got the completed Transaction

					return pendingInfo['confirmed-round']
				}
				lastRound++
				await this.algodClient.statusAfterBlock(lastRound).do()
			}
		}
		this.waitForTransactionResponse = async function (txId) {
			// Wait for confirmation
			await this.waitForConfirmation(txId)

			// display results
			return await this.algodClient.pendingTransactionInformation(txId).do()
		}

		this.printAppCallDelta = function(transactionResponse) {
			if (transactionResponse['global-state-delta'] !== undefined) {
				console.log('Global State updated:')
				tools.printAppCallDeltaArray (transactionResponse['global-state-delta'])
			}
			if (transactionResponse['local-state-delta'] !== undefined) {
				console.log('Local State updated:')
				tools.printAppCallDeltaArray (transactionResponse['local-state-delta'])
			}
		}

		// helper function to compile program source
		this.compileProgram = async function (programFilename) {
			const programBytes = fs.readFileSync(programFilename)
			const compileResponse = await this.algodClient.compile(programBytes).do()
			const compiledBytes = new Uint8Array(Buffer.from(compileResponse.result, 'base64'))
			return compiledBytes
		}

		this.compileClearProgram = async function () {
			let ret = await this.compileProgram(clearProgramFilename)
			return ret
		}

		this.compileApprovalProgram = async function () {
			let ret = await this.compileProgram(approvalProgramFilename)
			return ret
		}

		// create new application
		this.create = async function (creatorAccount) {
			// define sender as creator
			const sender = creatorAccount.addr
			const localInts = 10
			const localBytes = 10
			const globalInts = 10
			const globalBytes = 10

			// declare onComplete as NoOp
			const onComplete = algosdk.OnApplicationComplete.NoOpOC

			// get node suggested parameters
			const params = await algodClient.getTransactionParams().do()
			// comment out the next two lines to use suggested fee
			params.fee = 1000
			params.flatFee = true

			// create unsigned transaction
			const txn = algosdk.makeApplicationCreateTxn(sender, params, onComplete,
				this.compileApprovalProgram(), this.compileClearProgram(),
				localInts, localBytes, globalInts, globalBytes)
			const txId = txn.txID().toString()

			// Sign the transaction
			const signedTxn = txn.signTxn(creatorAccount.sk)
			// console.log('Signed transaction with txID: %s', txId)

			// Submit the transaction
			await algodClient.sendRawTransaction(signedTxn).do()
			return txId;
		}

		// optIn
		this.optIn = async function (account) {
			// define sender
			const sender = account.addr

			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do()
			// comment out the next two lines to use suggested fee
			params.fee = 1000
			params.flatFee = true

			// create unsigned transaction
			const txn = algosdk.makeApplicationOptInTxn(sender, params, this.appId)
			const txId = txn.txID().toString()

			// Sign the transaction
			const signedTxn = txn.signTxn(account.sk)

			// Submit the transaction
			await this.algodClient.sendRawTransaction(signedTxn).do()

			return txId
		}

		this.optInASA = async function (account) {
			const sender = account.addr

			const params = await this.algodClient.getTransactionParams().do()

			// comment out the next two lines to use suggested fee
			params.fee = 1000
			params.flatFee = true

			// create unsigned transaction
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(sender, account.addr, undefined, 
				undefined, 0, new Uint8Array(0), this.assetId, params)
			let txwALGOTransferSigned = txwALGOTransfer.signTxn(account.sk);

			let tx = (await this.algodClient.sendRawTransaction(txwALGOTransferSigned).do())

			return tx.txId
		}

		// setMintAccount
		this.setMintAccount = async function (adminAccount, mintAddr) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_MINT_ACCOUNT_OP)))
			let appAccounts = []
			appAccounts.push (mintAddr)

			return await this.callApp (adminAccount, appArgs, appAccounts)
		}
		
		this.setGlobalStatus = async function (adminAccount, newStatus) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_GLOBAL_STATUS_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newStatus)))

			return await this.callApp (adminAccount, appArgs)
		}
		
		this.setAccountStatus = async function (adminAccount, accountAddr, newStatus) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_STATUS_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newStatus)))

			let appAccounts = [];
			appAccounts.push (accountAddr)

			return await this.callApp (adminAccount, appArgs, appAccounts)
		}

		this.vaultCompiledTEALByAddress = async function(vaultAddr) {
			let program = vaultTEAL
			
			program = program.replace(/TMPL_APP_ID/g, this.appId)
			program = program.replace(/TMPL_USER_ADDRESS/g, vaultAddr)

			let encoder = new TextEncoder()
			let programBytes = encoder.encode(program);
			
			return await this.algodClient.compile(programBytes).do()
		}

		// registerVault
		this.registerVault = async function (account) {
			const compiledProgram = await this.vaultCompiledTEALByAddress(account.addr)

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(REGISTER_OP)))
			let appAccounts = [];
			appAccounts.push (compiledProgram.hash)

			return await this.callApp (account, appArgs, appAccounts)
		}
		
		// depositALGOs
		this.depositALGOs = async function (account, amount) {
			const sender = account.addr

			const params = await this.algodClient.getTransactionParams().do()

			// comment out the next two lines to use suggested fee
			params.fee = 1000
			params.flatFee = true

			let vaultAddr = await tools.readAppLocalStateByKey(this.algodClient, this.appId, account.addr, VAULT_ACCOUNT_LOCAL_KEY)

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(DEPOSIT_ALGOS_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(amount)))

			// create unsigned transaction
			let txApp = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs)
			let txPayment = algosdk.makePaymentTxnWithSuggestedParams(sender, vaultAddr, amount, undefined, new Uint8Array(0), params)
			let txns = [txApp, txPayment];

			// Group both transactions
			algosdk.assignGroupID(txns);

			let signed = []
			let txAppSigned = txApp.signTxn(account.sk);
			let txPaymentSigned = txPayment.signTxn(account.sk);
			signed.push(txAppSigned);
			signed.push(txPaymentSigned);

			let tx = (await this.algodClient.sendRawTransaction(signed).do())

			return tx.txId
		}

		// mintwALGOs
		this.mintwALGOs = async function (account, amount) {
			const sender = account.addr

			const params = await this.algodClient.getTransactionParams().do()

			// comment out the next two lines to use suggested fee
			params.fee = 1000
			params.flatFee = true

			let minterAddr = await tools.readAppGlobalStateByKey(this.algodClient, this.appId, this.creatorAddr, MINT_ACCOUNT_GLOBAL_KEY)
			let vaultAddr = await tools.readAppLocalStateByKey(this.algodClient, this.appId, account.addr, VAULT_ACCOUNT_LOCAL_KEY)

			if(!minterAddr) {
				throw new Error('ERROR: ' + MINT_ACCOUNT_GLOBAL_KEY + ' not defined')
			}
			if(!vaultAddr) {
				throw new Error('ERROR: Account not registered')
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(MINT_WALGOS_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(amount)))

			let appAccounts = []
			appAccounts.push (vaultAddr)

			// create unsigned transaction
			let txApp = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs, appAccounts)
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(minterAddr, sender, undefined, undefined, amount, new Uint8Array(0), 
				this.assetId, params)
			let txns = [txApp, txwALGOTransfer];

			// Group both transactions
			algosdk.assignGroupID(txns);

			let encoder = new TextEncoder();
			let programBytes = encoder.encode(minterTEAL);

			const compiledProgram = await this.algodClient.compile(programBytes).do()

			let minterProgram = new Uint8Array(Buffer.from(compiledProgram.result, "base64"));

			let lsigMinter = algosdk.makeLogicSig(minterProgram);

			let signed = []
			let txAppSigned = txApp.signTxn(account.sk);
			let txwALGOTransferSigned = algosdk.signLogicSigTransactionObject(txwALGOTransfer, lsigMinter);
			signed.push(txAppSigned);
			signed.push(txwALGOTransferSigned.blob);

			let tx = (await this.algodClient.sendRawTransaction(signed).do())

			return tx.txId
		}

		// withdrawALGOs
		this.withdrawALGOs = async function (account, amount) {
			const sender = account.addr

			const params = await this.algodClient.getTransactionParams().do()

			// comment out the next two lines to use suggested fee
			params.fee = 1000
			params.flatFee = true

			let vaultAddr = await tools.readAppLocalStateByKey(this.algodClient, this.appId, account.addr, VAULT_ACCOUNT_LOCAL_KEY)

			if(!vaultAddr) {
				throw new Error('ERROR: Account not registered')
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(WITHDRAW_ALGOS_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(amount)))

			let appAccounts = []
			appAccounts.push (vaultAddr)

			// create unsigned transaction
			let txApp = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs, appAccounts)
			let txWithdraw = algosdk.makePaymentTxnWithSuggestedParams(vaultAddr, sender, amount, undefined, new Uint8Array(0), params)

			let txns = [txApp, txWithdraw];

			// Group both transactions
			algosdk.assignGroupID(txns);

			const compiledProgram = await this.vaultCompiledTEALByAddress(sender)

			let vaultProgram = new Uint8Array(Buffer.from(compiledProgram.result, "base64"));

			let lsigVault = algosdk.makeLogicSig(vaultProgram);

			let signed = []
			let txAppSigned = txApp.signTxn(account.sk);
			let txWithdrawSigned = algosdk.signLogicSigTransactionObject(txWithdraw, lsigVault);
			signed.push(txAppSigned);
			signed.push(txWithdrawSigned.blob);

			let tx = (await this.algodClient.sendRawTransaction(signed).do())

			return tx.txId
		}

		// burnwALGOs
		this.burnwALGOs = async function (account, amount) {
			const sender = account.addr

			const params = await this.algodClient.getTransactionParams().do()

			// comment out the next two lines to use suggested fee
			params.fee = 1000
			params.flatFee = true

			let minterAddr = await tools.readAppGlobalStateByKey(this.algodClient, this.appId, this.creatorAddr, MINT_ACCOUNT_GLOBAL_KEY)
			if(!minterAddr) {
				throw new Error('ERROR: ' + MINT_ACCOUNT_GLOBAL_KEY + ' not defined')
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(BURN_ALGOS_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(amount)))

			// create unsigned transaction
			let txApp = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs)
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(sender, minterAddr, undefined, undefined, amount, new Uint8Array(0), 
				this.assetId, params)
			let txns = [txApp, txwALGOTransfer];

			// Group both transactions
			algosdk.assignGroupID(txns);

			let signed = []
			let txAppSigned = txApp.signTxn(account.sk);
			let txwALGOTransferSigned = txwALGOTransfer.signTxn(account.sk);
			signed.push(txAppSigned);
			signed.push(txwALGOTransferSigned);

			let tx = (await this.algodClient.sendRawTransaction(signed).do())

			return tx.txId
		}

		// call application
		this.callApp = async function (account, appArgs, appAccounts) {
			// define sender
			const sender = account.addr

			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do()
			// comment out the next two lines to use suggested fee
			params.fee = 1000
			params.flatFee = true

			// create unsigned transaction
			const txn = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs, appAccounts)
			const txId = txn.txID().toString()

			// Sign the transaction
			const signedTxn = txn.signTxn(account.sk)
			// console.log('Signed transaction with txID: %s', txId)

			// Submit the transaction
			await this.algodClient.sendRawTransaction(signedTxn).do()

			return txId
		}


		this.clearApp = async function (account) {
			// define sender as creator
			const sender = account.addr

			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do()
			// comment out the next two lines to use suggested fee
			params.fee = 1000
			params.flatFee = true

			// create unsigned transaction
			const txn = algosdk.makeApplicationClearStateTxn(sender, params, this.appId)
			const txId = txn.txID().toString()

			// Sign the transaction
			const signedTxn = txn.signTxn(account.sk)

			// Submit the transaction
			await this.algodClient.sendRawTransaction(signedTxn).do()

			return txId
		}

		this.updateApp = async function (creatorAccount) {
			// define sender as creator
			const sender = creatorAccount.addr

			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do()
			// comment out the next two lines to use suggested fee
			params.fee = 1000
			params.flatFee = true

			let approvalProgramCompiled = await this.compileApprovalProgram()
			let clearProgramCompiled = await this.compileClearProgram()

			// create unsigned transaction
			const txn = algosdk.makeApplicationUpdateTxn(sender, params, this.appId, approvalProgramCompiled, clearProgramCompiled)
			const txId = txn.txID().toString()

			// Sign the transaction
			const signedTxn = txn.signTxn(creatorAccount.sk)
			// console.log('Signed transaction with txID: %s', txId)

			// Submit the transaction
			await this.algodClient.sendRawTransaction(signedTxn).do()

			return txId
		}

		// close out from application
		// this.closeOutApp = async function (account, index) {
		// 	// define sender
		// 	const sender = account.addr

		// 	// get node suggested parameters
		// 	const params = await this.algodClient.getTransactionParams().do()
		// 	// comment out the next two lines to use suggested fee
		// 	params.fee = 1000
		// 	params.flatFee = true

		// 	// create unsigned transaction
		// 	const txn = algosdk.makeApplicationCloseOutTxn(sender, params, index)
		// 	const txId = txn.txID().toString()

		// 	// Sign the transaction
		// 	const signedTxn = txn.signTxn(account.sk)
		// 	console.log('Signed transaction with txID: %s', txId)

		// 	// Submit the transaction
		// 	await this.algodClient.sendRawTransaction(signedTxn).do()

		// 	return txId

		// 	// Wait for confirmation
		// 	await this.waitForConfirmation(txId)

		// 	// display results
		// 	const transactionResponse = await this.algodClient.pendingTransactionInformation(txId).do()
		// 	console.log('Closed out from app-id:', transactionResponse.txn.txn.apid)
		// }

		// this.deleteApp = async function (creatorAccount, index) {
		// 	// define sender as creator
		// 	const sender = creatorAccount.addr

		// 	// get node suggested parameters
		// 	const params = await this.algodClient.getTransactionParams().do()
		// 	// comment out the next two lines to use suggested fee
		// 	params.fee = 1000
		// 	params.flatFee = true

		// 	// create unsigned transaction
		// 	const txn = algosdk.makeApplicationDeleteTxn(sender, params, index)
		// 	const txId = txn.txID().toString()

		// 	// Sign the transaction
		// 	const signedTxn = txn.signTxn(creatorAccount.sk)
		// 	console.log('Signed transaction with txID: %s', txId)

		// 	// Submit the transaction
		// 	await this.algodClient.sendRawTransaction(signedTxn).do()

		// 	return txId

		// 	// Wait for confirmation
		// 	await this.waitForConfirmation(txId)

		// 	// display results
		// 	const transactionResponse = await this.algodClient.pendingTransactionInformation(txId).do()
		// 	const appId = transactionResponse.txn.txn.apid
		// 	console.log('Deleted app-id: ', appId)
		// 	return appId
		// }

	}
}

module.exports = { VaultManager }

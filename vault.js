const algosdk = require('algosdk')
const fs = require('fs')
const tools = require('./tools')
const { Console } = require('console');

const approvalProgramFilename = 'app-vault.teal'
const clearProgramFilename = 'app-vault-opt-out.teal'

var vaultTEAL = `#pragma version 2
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

class VaultManager {
	constructor (algodClient, appId = 0) {
		this.algodClient = algodClient
		this.appId = appId

		this.algodClient = algodClient

		this.setAppId = function (appId) {
			this.appId = appId
		}

		this.readLocalState = async function (accountAddr) {
			return tools.readAppLocalState(algodClient, accountAddr)
		}

		this.readGlobalState = async function (accountAddr) {
			return tools.readAppGlobalState(algodClient, accountAddr)
		}

		this.printLocalState = async function (accountAddr) {
			let ret = await tools.readAppLocalState(algodClient, this.appId, accountAddr)
			if (ret) {
				tools.printAppStateArray(ret);
			}
		}

		this.printGlobalState = async function (accountAddr) {
			let ret = await tools.readAppGlobalState(algodClient, this.appId, accountAddr)
			if (ret) {
				tools.printAppStateArray(ret);
			}
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

			// // Wait for confirmation
			// await this.waitForConfirmation(txId)

			// // display results
			// const transactionResponse = await this.algodClient.pendingTransactionInformation(txId).do()
			// const appId = transactionResponse['application-index']
			// console.log('Created new app-id: ', appId)

			// this.appId = appId

			// return appId
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
			// console.log('Signed transaction with txID: %s', txId)

			// Submit the transaction
			await this.algodClient.sendRawTransaction(signedTxn).do()

			return txId

			// // Wait for confirmation
			// await this.waitForConfirmation(txId)

			// // display results
			// const transactionResponse = await this.algodClient.pendingTransactionInformation(txId).do()
			// console.log('Opted-in to app-id:', transactionResponse.txn.txn.apid)
		}

		// setMintAccount
		this.setMintAccount = async function (adminAccount, mintAddr) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from('mint-account')))
			let appAccounts = []
			appAccounts.push (mintAddr)

			return await this.callApp (adminAccount, appArgs, appAccounts)
		}
		
		this.setGlobalStatus = async function (adminAccount, newStatus) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from('global-status')))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newStatus)))

			return await this.callApp (adminAccount, appArgs)
		}
		
		this.setLocalStatus = async function (account, newStatus) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from('status')))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newStatus)))

			return await this.callApp (account, appArgs)
		}

		// registerVault
		this.registerVault = async function (account) {
			let program = vaultTEAL
			
			program = program.replace(/TMPL_APP_ID/g, this.appId)
			program = program.replace(/TMPL_USER_ADDRESS/g, account.addr)

			let encoder = new TextEncoder();
			let programBytes = encoder.encode(program);
			
			const compiledProgram = await this.algodClient.compile(programBytes).do()

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from('register')))
			let appAccounts = [];
			appAccounts.push (compiledProgram.hash)

			return await this.callApp (account, appArgs, appAccounts)
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

			// // Wait for confirmation
			// await this.waitForConfirmation(txId)

			// // display results
			// const transactionResponse = await this.algodClient.pendingTransactionInformation(txId).do()
			// console.log('Called app-id:', transactionResponse.txn.txn.apid)
			// if (transactionResponse['global-state-delta'] !== undefined) {
			// 	console.log('Global State updated:')
			// 	tools.printAppCallDeltaArray (transactionResponse['global-state-delta'])
			// }
			// if (transactionResponse['local-state-delta'] !== undefined) {
			// 	console.log('Local State updated:')
			// 	tools.printAppCallDeltaArray (transactionResponse['local-state-delta'])
			// }

			// return txId
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

			// // Wait for confirmation
			// await this.waitForConfirmation(txId)

			// // display results
			// const transactionResponse = await this.algodClient.pendingTransactionInformation(txId).do()
			// const appId = transactionResponse.txn.txn.apid
			// console.log('Cleared address: ', account.addr, ' in AppId ' + appId)

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

			// // Wait for confirmation
			// await this.waitForConfirmation(txId)

			// // display results
			// const transactionResponse = await this.algodClient.pendingTransactionInformation(txId).do()
			// const appId = transactionResponse.txn.txn.apid
			// console.log('Updated app-id: ', appId)
			// return appId
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

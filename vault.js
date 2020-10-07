const algosdk = require('algosdk')
const fs = require('fs')
const tools = require('./tools')
const { Console } = require('console');

const approvalProgramFilename = 'app-vault.teal'
const clearProgramFilename = 'app-vault-opt-out.teal'

const MINT_ACCOUNT_GLOBAL_KEY = 'MA'
const MINT_FEE_GLOBAL_KEY = 'MF'
const WITHDRAW_FEE_GLOBAL_KEY = 'WF'

const VAULT_ACCOUNT_LOCAL_KEY = 'v'
const DEPOSITS_LOCAL_KEY = 'd'
const WITHDRAWALS_LOCAL_KEY = 'w'
const MINTS_LOCAL_KEY = 'm'
const REWARDS_FEE_LAST_CALCULATION_LOCAL_KEY = 'rf'
const PENDING_ADMIN_FEES_LOCAL_KEY = 'fees'

const DEPOSIT_ALGOS_OP = 'dA'
const MINT_WALGOS_OP = 'mw'
const WITHDRAW_ALGOS_OP = 'wA'
const BURN_ALGOS_OP = 'bw'

const SET_ADMIN_ACCOUNT_OP = 'sAA'
const SET_ACCOUNT_STATUS_OP = 'sAS'
const SET_GLOBAL_STATUS_OP = 'sGS'
const SET_MINT_ACCOUNT_OP = 'sMA'
const SET_MINT_FEE_OP = 'sMF'
const SET_WITHDRAW_FEE_OP = 'sWF'

var vaultTEAL = 
`#pragma version 2
txn Receiver 
addr TMPL_USER_ADDRESS
==
pop

//global GroupSize
//int 2
//>=
//&&

// Application Call
//gtxn 0 TypeEnum
//int 6
//==
//&&

gtxn 0 ApplicationID // betanet
int TMPL_APP_ID
==
//&&
`
var minterTEAL = 
`#pragma version 2
int 1
return
`

class VaultManager {
	constructor (algodClient, appId = 0, adminAddr = undefined, assetId = 0) {
		this.algodClient = algodClient
		this.appId = appId
		this.adminAddr = adminAddr
		this.assetId = assetId
		this.algodClient = algodClient
		this.vaultMinBalance = 100000
		this.minFee = 1000

		this.setAppId = function (appId) {
			this.appId = appId
		}

		this.setCreator = function (adminAddr) {
			this.adminAddr = adminAddr
		}

		this.minVaultBalance = function() {
			return this.vaultMinBalance
		}

		this.minTransactionFee = function() {
			return this.minFee
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
			return await tools.readAppLocalStateByKey(this.algodClient, this.appId, accountAddr, key)
		}

		this.readGlobalStateByKey = async function (key) {
			return await tools.readAppGlobalStateByKey(this.algodClient, this.appId, this.adminAddr, key)
		}

		this.vaultBalance = async function (accountAddr) {
			let vaultAddr = await this.vaultAddressByTEAL(accountAddr)
			let accountInfo = await this.algodClient.accountInformation(vaultAddr).do()
			return accountInfo.amount
		}

		this.vaultAddressByApp = async function (accountAddr) {
			return await this.readLocalStateByKey(accountAddr, VAULT_ACCOUNT_LOCAL_KEY)
		}		

		this.vaultAddressByTEAL = async function (accountAddr) {
			let compiledProgram = (await this.vaultCompiledTEALByAddress(accountAddr))

			// const byteCharacters = Buffer.from(compiledProgram.result, 'base64')
			
			// console.log('Program bytes %s', tools.uintArray8ToString(byteCharacters))

			return compiledProgram.hash
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
			return await this.compileProgram(clearProgramFilename)
		}

		this.compileApprovalProgram = async function () {
			return await this.compileProgram(approvalProgramFilename)
		}

		this.appIdFromCreateAppResponse = function(txResponse) {
			return txResponse["application-index"]
		}

		// create new application
		this.createApp = async function (adminAccount) {
			// define sender as creator
			const sender = adminAccount.addr
			const localInts = 10
			const localBytes = 2
			const globalInts = 10
			const globalBytes = 2

			// declare onComplete as NoOp
			const onComplete = algosdk.OnApplicationComplete.NoOpOC

			// get node suggested parameters
			const params = await algodClient.getTransactionParams().do()
			// comment out the next two lines to use suggested fee
			params.fee = this.minFee
			params.flatFee = true

			let approvalProgramCompiled = await this.compileApprovalProgram()
			let clearProgramCompiled = await this.compileClearProgram()

			// create unsigned transaction
			const txn = algosdk.makeApplicationCreateTxn(sender, params, onComplete,
				approvalProgramCompiled, clearProgramCompiled,
				localInts, localBytes, globalInts, globalBytes)
			const txId = txn.txID().toString()

			// Sign the transaction
			const signedTxn = txn.signTxn(adminAccount.sk)
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
			params.fee = this.minFee
			params.flatFee = true

			// create unsigned transaction
			const txn = await algosdk.makeApplicationOptInTxn(sender, params, this.appId)
			const txId = txn.txID().toString()

			// Sign the transaction
			const signedTxn = txn.signTxn(account.sk)

			// Submit the transaction
			await this.algodClient.sendRawTransaction(signedTxn).do()

			return txId
		}

		this.assetBalance = async function(accountAddr) {
			let response = await this.algodClient.accountInformation(accountAddr).do()

			for(let i = 0; i < response.assets.length; i++) {
				if(response.assets[i]["asset-id"] == this.assetId) {
					return response.assets[i]["amount"]
				}
			}
			return 0
		}

		this.transferAsset = async function (account, destAddr, amount, closeAddr) {
			const sender = account.addr

			const params = await this.algodClient.getTransactionParams().do()

			// comment out the next two lines to use suggested fee
			params.fee = this.minFee
			params.flatFee = true

			// create unsigned transaction
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(sender, destAddr, closeAddr, 
				undefined, amount, new Uint8Array(0), this.assetId, params)
			let txwALGOTransferSigned = txwALGOTransfer.signTxn(account.sk)

			let tx = (await this.algodClient.sendRawTransaction(txwALGOTransferSigned).do())

			return tx.txId
		}

		this.optInASA = async function (account) {
			const sender = account.addr

			const params = await this.algodClient.getTransactionParams().do()

			// comment out the next two lines to use suggested fee
			params.fee = this.minFee
			params.flatFee = true

			// create unsigned transaction
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(sender, account.addr, undefined, 
				undefined, 0, new Uint8Array(0), this.assetId, params)
			let txwALGOTransferSigned = txwALGOTransfer.signTxn(account.sk)

			let tx = (await this.algodClient.sendRawTransaction(txwALGOTransferSigned).do())

			return tx.txId
		}

		// setAdminAccount
		this.setAdminAccount = async function (adminAccount, newAdminAddr) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_ADMIN_ACCOUNT_OP)))
			let appAccounts = []
			appAccounts.push (newAdminAddr)

			return await this.callApp (adminAccount, appArgs, appAccounts)
		}

		// setMintAccount
		this.setMintAccount = async function (adminAccount, mintAddr) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_MINT_ACCOUNT_OP)))
			let appAccounts = []
			appAccounts.push (mintAddr)

			return await this.callApp (adminAccount, appArgs, appAccounts)
		}
		
		// setMintFee
		this.setMintFee = async function (adminAccount, newFee) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_MINT_FEE_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newFee)))

			return await this.callApp (adminAccount, appArgs)
		}

		this.mintFee = async function () {
			let ret = await vaultManager.readGlobalStateByKey(MINT_FEE_GLOBAL_KEY)
			if(!ret) {
				return 0
			}
			return ret
		}
		
		// setDepositFee
		this.setWithdrawFee = async function (adminAccount, newFee) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_WITHDRAW_FEE_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newFee)))

			return await this.callApp (adminAccount, appArgs)
		}

		this.withdrawFee = async function () {
			let ret = await vaultManager.readGlobalStateByKey(WITHDRAW_FEE_GLOBAL_KEY)
			if(!ret) {
				return 0
			}
			return ret
		}

		this.setGlobalStatus = async function (adminAccount, newStatus) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_GLOBAL_STATUS_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newStatus)))

			return await this.callApp (adminAccount, appArgs)
		}
		
		this.setAccountStatus = async function (adminAccount, accountAddr, newStatus) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_ACCOUNT_STATUS_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newStatus)))

			let appAccounts = [];
			appAccounts.push (accountAddr)

			return await this.callApp (adminAccount, appArgs, appAccounts)
		}

		this.deposits = async function (accountAddr) {
			let ret = await vaultManager.readLocalStateByKey(accountAddr, DEPOSITS_LOCAL_KEY)
			if(!ret) {
				return 0
			}
			return ret
		}

		this.withdrawals = async function (accountAddr) {
			let ret = await vaultManager.readLocalStateByKey(accountAddr, WITHDRAWALS_LOCAL_KEY)
			if(!ret) {
				return 0
			}
			return ret
		}

		this.mints = async function (accountAddr) {
			let ret = await vaultManager.readLocalStateByKey(accountAddr, MINTS_LOCAL_KEY)
			if(!ret) {
				return 0
			}
			return ret
		}

		// adminVaultFees: get fees for the Admin
		this.adminVaultFees = async function (accountAddr) {
			let ret = await vaultManager.readLocalStateByKey(accountAddr, PENDING_ADMIN_FEES_LOCAL_KEY)
			if(!ret) {
				return 0
			}
			return ret
		}

		// pendingFees: get Vault's Admin unclaimed fees 
		this.pendingFees = async function (accountAddr) {
			return await vaultManager.readLocalStateByKey(accountAddr, PENDING_ADMIN_FEES_LOCAL_KEY)
		}

		// maxWithdrawAmount: get the total rewards fees generated by the Vault
		this.maxWithdrawAmount = async function (accountAddr) {
			let vaultBalance = await this.vaultBalance(accountAddr)
			let minted = await this.mints(accountAddr)
			let pendingFees = await this.pendingFees(accountAddr)
			let fee = await this.withdrawFee() / 10000

			let totalFees = Math.floor((vaultBalance - pendingFees - this.minTransactionFee())*fee / (1+fee)) + pendingFees

			let amount = vaultBalance - minted - totalFees - this.minTransactionFee()
			if(amount < 0) {
				return 0
			}
			if(vaultBalance - amount - this.minTransactionFee() < this.minVaultBalance()) {
				amount = vaultBalance - this.minVaultBalance() - this.minTransactionFee()
			}
			return amount
		}

		this.maxMintAmount = async function (accountAddr) {
			let vaultBalance = await this.vaultBalance(accountAddr)
			let minted = await this.mints(accountAddr)
			let pendingFees = await this.pendingFees(accountAddr)
			let fee = await this.mintFee()

			let totalFees = Math.floor((vaultBalance - pendingFees)*fee / (1+fee) + pendingFees)

			let amount = vaultBalance - minted - totalFees
			return amount
		}

		this.vaultCompiledTEALByAddress = async function(accountAddr) {
			let program = vaultTEAL
			
			program = program.replace(/TMPL_APP_ID/g, this.appId)
			program = program.replace(/TMPL_USER_ADDRESS/g, accountAddr)

			let encoder = new TextEncoder()
			let programBytes = encoder.encode(program);

			return await this.algodClient.compile(programBytes).do()
		}

		// depositALGOs
		this.depositALGOs = async function (account, amount) {
			const sender = account.addr

			const params = await this.algodClient.getTransactionParams().do()

			// comment out the next two lines to use suggested fee
			params.fee = this.minFee
			params.flatFee = true

			let vaultAddr = await this.readLocalStateByKey(account.addr, VAULT_ACCOUNT_LOCAL_KEY)
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
			}

			// create unsigned transaction
			let txPayment = algosdk.makePaymentTxnWithSuggestedParams(sender, vaultAddr, amount, undefined, new Uint8Array(0), params)

			let signed = []
			let txPaymentSigned = txPayment.signTxn(account.sk);
			signed.push(txPaymentSigned);

			let tx = (await this.algodClient.sendRawTransaction(signed).do())

			return tx.txId
		}

		// mintwALGOs
		this.mintwALGOs = async function (account, amount) {
			const sender = account.addr

			const params = await this.algodClient.getTransactionParams().do()

			// comment out the next two lines to use suggested fee
			params.fee = this.minFee
			params.flatFee = true

			let minterAddr = await this.readGlobalStateByKey(MINT_ACCOUNT_GLOBAL_KEY)
			let vaultAddr = await this.readLocalStateByKey(account.addr, VAULT_ACCOUNT_LOCAL_KEY)

			if(!minterAddr) {
				throw new Error('ERROR: ' + MINT_ACCOUNT_GLOBAL_KEY + ' not defined')
			}
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
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
			params.fee = this.minFee
			params.flatFee = true

			let vaultAddr = await this.readLocalStateByKey(account.addr, VAULT_ACCOUNT_LOCAL_KEY)
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
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
			params.fee = this.minFee
			params.flatFee = true

			let minterAddr = await this.readGlobalStateByKey(MINT_ACCOUNT_GLOBAL_KEY)
			if(!minterAddr) {
				throw new Error('ERROR: ' + MINT_ACCOUNT_GLOBAL_KEY + ' not defined')
			}
			let vaultAddr = await this.readLocalStateByKey(account.addr, VAULT_ACCOUNT_LOCAL_KEY)
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
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
		// withdrawAdminFees
		this.withdrawAdminFees = async function (adminAccount, accountAddr, amount) {
			const sender = account.addr

			const params = await this.algodClient.getTransactionParams().do()

			// comment out the next two lines to use suggested fee
			params.fee = this.minFee
			params.flatFee = true

			let vaultAddr = await this.readLocalStateByKey(accountAddr, VAULT_ACCOUNT_LOCAL_KEY)
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
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

		this.closeOut = async function (account) {
			const sender = account.addr

			const params = await this.algodClient.getTransactionParams().do()

			// comment out the next two lines to use suggested fee
			params.fee = this.minFee
			params.flatFee = true

			let vaultAddr = await this.readLocalStateByKey(account.addr, VAULT_ACCOUNT_LOCAL_KEY)
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
			}

			let withdrawFee = await this.readGlobalStateByKey(WITHDRAW_FEE_GLOBAL_KEY)/10000
			let vaultBalance = await this.vaultBalance(account.addr)

			// newWithdrawOperationFee = (vaultBalance - prevFee - newWithdrawOperationFee)*withdrawFee
			// newWithdrawOperationFee = vaultBalance*withdrawFee - prevFee*withdrawFee - newWithdrawOperationFee*withdrawFee
			// newWithdrawOperationFee + newWithdrawOperationFee*withdrawFee = vaultBalance*withdrawFee - prevFee*withdrawFee
			// (1+withdrawFee)*newWithdrawOperationFee = vaultBalance*withdrawFee - prevFee*withdrawFee
			// newWithdrawOperationFee = (vaultBalance*withdrawFee - prevFee*withdrawFee) / (1+withdrawFee)
			let prevFees = await this.readLocalStateByKey(sender, PENDING_ADMIN_FEES_LOCAL_KEY)
			let totalFees = Math.floor((vaultBalance - prevFees - this.minTransactionFee())*withdrawFee / (1+withdrawFee) + prevFees)

			let appArgs = [];
			appArgs.push(new Uint8Array(tools.getInt64Bytes(totalFees)))

			let appAccounts = []
			appAccounts.push (vaultAddr)

			// create unsigned transaction
			const txApp = algosdk.makeApplicationCloseOutTxn(sender, params, this.appId, appArgs, appAccounts)
			let txWithdraw = algosdk.makePaymentTxnWithSuggestedParams(vaultAddr, sender, totalFees, this.adminAddr, 
																																	new Uint8Array(0), params)

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

		// call application
		this.callApp = async function (account, appArgs, appAccounts) {
			// define sender
			const sender = account.addr

			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do()
			// comment out the next two lines to use suggested fee
			params.fee = this.minFee
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
			params.fee = this.minFee
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

		this.updateApp = async function (adminAccount) {
			// define sender as creator
			const sender = adminAccount.addr

			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do()
			// comment out the next two lines to use suggested fee
			params.fee = this.minFee
			params.flatFee = true

			let approvalProgramCompiled = await this.compileApprovalProgram()
			let clearProgramCompiled = await this.compileClearProgram()

			// create unsigned transaction
			const txn = algosdk.makeApplicationUpdateTxn(sender, params, this.appId, approvalProgramCompiled, clearProgramCompiled)
			const txId = txn.txID().toString()

			// Sign the transaction
			const signedTxn = txn.signTxn(adminAccount.sk)
			// console.log('Signed transaction with txID: %s', txId)

			// Submit the transaction
			await this.algodClient.sendRawTransaction(signedTxn).do()

			return txId
		}


		this.deleteApp = async function (adminAccount) {
			// define sender as creator
			const sender = adminAccount.addr

			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do()
			// comment out the next two lines to use suggested fee
			params.fee = this.minFee
			params.flatFee = true

			// create unsigned transaction
			const txn = algosdk.makeApplicationDeleteTxn(sender, params, this.appId)
			const txId = txn.txID().toString()

			// Sign the transaction
			const signedTxn = txn.signTxn(adminAccount.sk)

			// Submit the transaction
			await this.algodClient.sendRawTransaction(signedTxn).do()

			return txId
		}

	}
}

module.exports = { 
	VaultManager,
	MINT_ACCOUNT_GLOBAL_KEY,
	MINT_FEE_GLOBAL_KEY,
	WITHDRAW_FEE_GLOBAL_KEY,
	PENDING_ADMIN_FEES_LOCAL_KEY,
	REWARDS_FEE_LAST_CALCULATION_LOCAL_KEY,

	VAULT_ACCOUNT_LOCAL_KEY,
	DEPOSITS_LOCAL_KEY,
	WITHDRAWALS_LOCAL_KEY,
	MINTS_LOCAL_KEY,
	PENDING_ADMIN_FEES_LOCAL_KEY,
		
	DEPOSIT_ALGOS_OP,
	MINT_WALGOS_OP,
	WITHDRAW_ALGOS_OP,
	BURN_ALGOS_OP,
	
	SET_ACCOUNT_STATUS_OP,
	SET_GLOBAL_STATUS_OP,
	SET_MINT_ACCOUNT_OP
}

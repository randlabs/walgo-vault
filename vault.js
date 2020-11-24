const algosdk = require('algosdk')
const fs = require('fs')
const tools = require('./tools')
const { Console } = require('console');

const approvalProgramFilename = 'app-vault.teal'
const clearProgramFilename = 'app-vault-clear-state.teal'

const GLOBAL_STATUS_GLOBAL_KEY = 'GS'
const ADMIN_ACCOUNT_GLOBAL_KEY = 'A'
const MINT_ACCOUNT_GLOBAL_KEY = 'MA'
const MINT_FEE_GLOBAL_KEY = 'MF'
const BURN_FEE_GLOBAL_KEY = 'BF'
const CREATION_FEE_GLOBAL_KEY = 'CF'

const VAULT_ACCOUNT_LOCAL_KEY = 'v'
const MINTED_LOCAL_KEY = 'm'
const VAULT_STATUS_LOCAL_KEY = 's'

const MINT_WALGOS_OP = 'mw'
const WITHDRAW_ALGOS_OP = 'wA'
const BURN_ALGOS_OP = 'bw'

const SET_ADMIN_ACCOUNT_OP = 'sAA'
const SET_ACCOUNT_STATUS_OP = 'sAS'
const SET_GLOBAL_STATUS_OP = 'sGS'
const SET_MINT_ACCOUNT_OP = 'sMA'
const SET_MINT_FEE_OP = 'sMF'
const SET_BURN_FEE_OP = 'sBF'
const SET_CREATION_FEE_OP = 'sCF'


var vaultTEAL = 
`#pragma version 2
addr TMPL_USER_ADDRESS
pop

gtxn 0 ApplicationID
int TMPL_APP_ID
==

gtxn 0 OnCompletion
int NoOp
==

gtxn 0 OnCompletion
int CloseOut
==
||

&&

// do not allow to call the App from the Vault
txn GroupIndex
int 0
!=
&&

gtxn 0 Accounts 1
txn Sender
==
&&

txn RekeyTo
global ZeroAddress
==
&&

`
var minterTEAL = 
`#pragma version 2
// Minter Delegate Teal
// Allows App to mint wAlgos to Vault users
// TMPL_APP_ID: Application ID
// TMPL_ASA_ID: wALGOs id

gtxn 0 ApplicationID
int TMPL_APP_ID
==

txn AssetCloseTo 
global ZeroAddress
==
&&

gtxn 1 TypeEnum
int 4
==
&&

gtxn 0 OnCompletion
int NoOp
==
&&

// only use this account on mintwALGOs function
gtxn 0 ApplicationArgs 0
byte "mw" // mintwALGOs
==
&&

// do not allow to create neutral txs
txn AssetSender
txn AssetReceiver
!=
&&

// ASA ID
gtxn 1 XferAsset
int TMPL_ASA_ID
==
&&

txn RekeyTo
global ZeroAddress
==
&&

txn AssetCloseTo 
global ZeroAddress
==
&&

// do not allow to call the App from the Vault, only allow calls in index 1 that are XferAsset
txn GroupIndex
int 1
==
&&
`

class VaultManager {
	constructor (algodClient, appId = 0, adminAddr = undefined, assetId = 0) {
		this.algodClient = algodClient
		this.appId = appId
		this.adminAddr = adminAddr
		this.assetId = assetId
		this.lsigMint
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

		this.anyAppCallDelta = function(transactionResponse) {
			return (transactionResponse['global-state-delta'] || transactionResponse['local-state-delta'])
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
			// use any address to replace in the template
			const compiledVaultProgram = await this.vaultCompiledTEALByAddress(this.adminAddr)
			
			let buffer = Buffer.from(compiledVaultProgram.result, 'base64');
			let compiledVaultProgramHex = buffer.toString('hex');

			let prefix = compiledVaultProgramHex.substring(0, 24)
			let suffix = compiledVaultProgramHex.substring(88)

			buffer = Buffer.from(prefix, 'hex');
			let prefixBase64 = buffer.toString('base64');
			buffer = Buffer.from(suffix, 'hex');
			let suffixBase64 = buffer.toString('base64');

			let program = fs.readFileSync(approvalProgramFilename, 'utf8')


			program = program.replace(/TMPL_ASA_ID/g, this.assetId)
			// program = program.replace(/TMPL_VAULT_TEAL_PREFIX/g, "AiAD3rekAQACJgEg")
			// program = program.replace(/TMPL_VAULT_TEAL_SUFFIX/g, "KEgzABgiEjMAGSMSMwAZJBIREDEWIxMQNwAcATEAEhAxIDIDEhA=")
			program = program.replace(/TMPL_VAULT_TEAL_PREFIX/g, prefixBase64)
			program = program.replace(/TMPL_VAULT_TEAL_SUFFIX/g, suffixBase64)

			let encoder = new TextEncoder()
			let programBytes = encoder.encode(program);

			const compileResponse = await this.algodClient.compile(programBytes).do()
			const compiledBytes = new Uint8Array(Buffer.from(compileResponse.result, 'base64'))
			return compiledBytes
		}

		this.appIdFromCreateAppResponse = function(txResponse) {
			return txResponse["application-index"]
		}

		// create new application
		// @approvalCodeFile
		// @clearCodeFile
		this.createApp = async function (sender, signCallback, approvalCodeFile, clearCodeFile) {
			const localInts = 3
			const localBytes = 2
			const globalInts = 5
			const globalBytes = 3

			// declare onComplete as NoOp
			const onComplete = algosdk.OnApplicationComplete.NoOpOC

			// get node suggested parameters
			const params = await algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			let approvalProgramCompiled
			let clearProgramCompiled

			if(approvalCodeFile) {
				approvalProgramCompiled = await this.compileProgram(approvalCodeFile)
			}
			else {
				approvalProgramCompiled = await this.compileApprovalProgram()
			}
			if(clearCodeFile) {
				clearProgramCompiled = await this.compileProgram(clearCodeFile)
			}
			else {
				clearProgramCompiled = await this.compileClearProgram()
			}

			// create unsigned transaction
			const txApp = algosdk.makeApplicationCreateTxn(sender, params, onComplete,
				approvalProgramCompiled, clearProgramCompiled,
				localInts, localBytes, globalInts, globalBytes)
			const txId = txApp.txID().toString()

			// Sign the transaction
			let txAppSigned = signCallback(sender, txApp)
			//const txAppSigned = txApp.signTxn(adminAccount.sk)

			// Submit the transaction
			await algodClient.sendRawTransaction(txAppSigned).do()
			return txId;
		}

		this.generateDelegatedMintAccount = async function(sender, lsigCallback) {
			let program = minterTEAL
			
			program = program.replace(/TMPL_APP_ID/g, this.appId)
			program = program.replace(/TMPL_ASA_ID/g, this.assetId)

			let encoder = new TextEncoder()
			let programBytes = encoder.encode(program);

			let compiledProgram = await this.algodClient.compile(programBytes).do()

			let minterProgram = new Uint8Array(Buffer.from(compiledProgram.result, "base64"));

			let lsigMinter = algosdk.makeLogicSig(minterProgram);

			// let lsigProgram = algosdk.makeLogicSig(compiledProgram);

			lsigCallback(sender, lsigMinter)

			return lsigMinter
		}

		this.delegateMintAccountFromFile = function(filepath) {
			let lsiguintArray = fs.readFileSync(filepath)
			let lsigb64 = lsiguintArray.toString()

			let lsigEncoded = new Uint8Array(Buffer.from(lsigb64, "base64"));

			let lsigDecoded = algosdk.decodeObj(lsigEncoded)

			let lsigDelegatedReconst = algosdk.makeLogicSig(lsigDecoded.l, lsigDecoded.arg);
			lsigDelegatedReconst.sig = lsigDecoded.sig;
			lsigDelegatedReconst.msig = lsigDecoded.msig;

			this.delegateMintAccount(lsigDelegatedReconst)
		}

		this.generateDelegatedMintAccountToFile = async function(filepath, lsigCallback) {
			let minterAddr = await this.mintAccount()
			let lsigDelegatedBuf = await this.generateDelegatedMintAccount(minterAddr, lsigCallback)

			let encodedObj = lsigDelegatedBuf.get_obj_for_encoding()
			let lsigEncoded = algosdk.encodeObj(encodedObj)
			var lsigb64 = Buffer.from(lsigEncoded).toString('base64');
			fs.writeFileSync(filepath, lsigb64)
		}

		this.delegateMintAccount = async function(lsigMint) {
			// let decodedLsig = algosdk.decodeObj(lsigMintBuf);
			// this.lsigMint = algosdk.makeLogicSig(decodedLsig.l, decodedLsig.arg);
			this.lsigMint = lsigMint
			// this.lsigMint.sig = decodedLsig.sig;
			// this.lsigMint.msig = decodedLsig.msig;
		}

		// optIn
		// @forceCreationFee: force the amount of fees to pay to admin. Used to test.
		// @forceFeeTo: force To address instead of using the Admin. Used to test.
		this.optIn = async function (sender, signCallback, forceCreationFee, forceFeeTo) {
			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			let vaultAddr = await this.vaultAddressByTEAL(sender)
			let fee = await this.creationFee()
			let toAddr = this.adminAddr

			if(forceFeeTo) {
				toAddr = forceFeeTo
			}
			if(forceCreationFee) {
				fee = forceCreationFee
			}

			let appAccounts = []
			appAccounts.push (vaultAddr)

			// create unsigned transaction
			const txApp = await algosdk.makeApplicationOptInTxn(sender, params, this.appId, undefined, appAccounts)

			if(fee !== 0) {
				// pay the fees
				let txPayment = algosdk.makePaymentTxnWithSuggestedParams(sender, toAddr, fee, undefined, new Uint8Array(0), params)
				let txns = [txApp, txPayment];
	
				// Group both transactions
				algosdk.assignGroupID(txns);
		
				let signed = []
				let txAppSigned = signCallback(sender, txApp)
				let txPaymentSigned = signCallback(sender, txPayment)

				signed.push(txAppSigned);
				signed.push(txPaymentSigned);
	
				let tx = (await this.algodClient.sendRawTransaction(signed).do())
	
				return tx.txId
			}
			else {
				const txId = txApp.txID().toString()

				// Sign the transaction
				let txAppSigned = signCallback(sender, txApp)
				//const txAppSigned = txApp.signTxn(account.sk)
	
				// Submit the transaction
				await this.algodClient.sendRawTransaction(txAppSigned).do()
	
				return txId
			}
		}

		// @forceAssetId: force assetId. Used to test.
		this.assetBalance = async function(accountAddr, forceAssetId) {
			let response = await this.algodClient.accountInformation(accountAddr).do()
			let assetId = this.assetId

			if(forceAssetId) {
				assetId = forceAssetId
			}

			for(let i = 0; i < response.assets.length; i++) {
				if(response.assets[i]["asset-id"] == assetId) {
					return response.assets[i]["amount"]
				}
			}
			return 0
		}

		// @forceAssetId: force assetId. Used to test.
		this.transferAsset = async function (sender, destAddr, amount, closeAddr, signCallback, forceAssetId) {
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			let assetId = this.assetId

			if(forceAssetId) {
				assetId = forceAssetId
			}

			// create unsigned transaction
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(sender, destAddr, closeAddr, 
				undefined, amount, new Uint8Array(0), assetId, params)
			let txwALGOTransferSigned = signCallback(sender, txwALGOTransfer)

			let tx = (await this.algodClient.sendRawTransaction(txwALGOTransferSigned).do())

			return tx.txId
		}

		// @forceAssetId: force assetId. Used to test.
		this.optInASA = async function (sender, signCallback, forceAssetId) {
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			let assetId = this.assetId

			if(forceAssetId) {
				assetId = forceAssetId
			}

			// create unsigned transaction
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(sender, sender, undefined, 
				undefined, 0, new Uint8Array(0), assetId, params)
			
			let txwALGOTransferSigned = signCallback(sender, txwALGOTransfer)

			let tx = (await this.algodClient.sendRawTransaction(txwALGOTransferSigned).do())

			return tx.txId
		}

		// setAdminAccount
		this.setAdminAccount = async function (sender, newAdminAddr, signCallback) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_ADMIN_ACCOUNT_OP)))
			let appAccounts = []
			appAccounts.push (newAdminAddr)

			return await this.callApp (sender, appArgs, appAccounts, signCallback)
		}

		this.adminAccount = async function () {
			let ret = await this.readGlobalStateByKey(ADMIN_ACCOUNT_GLOBAL_KEY)
			if(!ret) {
				return 0
			}
			return ret
		}
		
		// setMintAccount
		this.setMintAccount = async function (sender, mintAddr, signCallback) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_MINT_ACCOUNT_OP)))
			let appAccounts = []
			appAccounts.push (mintAddr)

			return await this.callApp(sender, appArgs, appAccounts, signCallback)
		}
		
		this.mintAccount = async function () {
			let ret = await this.readGlobalStateByKey(MINT_ACCOUNT_GLOBAL_KEY)
			if(!ret) {
				return 0
			}
			return ret
		}
		
		// setMintFee
		this.setMintFee = async function (sender, newFee, signCallback) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_MINT_FEE_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newFee)))

			return await this.callApp(sender, appArgs, undefined, signCallback)
		}

		this.mintFee = async function () {
			let ret = await this.readGlobalStateByKey(MINT_FEE_GLOBAL_KEY)
			if(!ret) {
				return 0
			}
			return ret
		}
		
		// setDepositFee
		this.setBurnFee = async function (sender, newFee, signCallback) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_BURN_FEE_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newFee)))

			return await this.callApp(sender, appArgs, undefined, signCallback)
		}

		this.burnFee = async function () {
			let ret = await this.readGlobalStateByKey(BURN_FEE_GLOBAL_KEY)
			if(!ret) {
				return 0
			}
			return ret
		}

		// setMintFee
		this.setCreationFee = async function (sender, newFee, signCallback) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_CREATION_FEE_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newFee)))

			return await this.callApp(sender, appArgs, undefined, signCallback)
		}

		this.creationFee = async function () {
			let ret = await this.readGlobalStateByKey(CREATION_FEE_GLOBAL_KEY)
			if(!ret) {
				return 0
			}
			return ret
		}

		this.setGlobalStatus = async function (sender, newStatus, signCallback) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_GLOBAL_STATUS_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newStatus)))

			return await this.callApp(sender, appArgs, undefined, signCallback)
		}
		
		this.globalStatus = async function () {
			let ret = await this.readGlobalStateByKey(GLOBAL_STATUS_GLOBAL_KEY)
			if(!ret) {
				return 0
			}
			return ret
		}
				
		this.setAccountStatus = async function (sender, accountAddr, newStatus, signCallback) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_ACCOUNT_STATUS_OP)))
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newStatus)))

			let appAccounts = [];
			appAccounts.push (accountAddr)

			return await this.callApp(sender, appArgs, appAccounts, signCallback)
		}

		this.accountStatus = async function (accountAddr) {
			let ret = await this.readLocalStateByKey(accountAddr, VAULT_STATUS_LOCAL_KEY)
			if(!ret) {
				return 0
			}
			return ret
		}
				
		this.minted = async function (accountAddr) {
			let ret = await this.readLocalStateByKey(accountAddr, MINTED_LOCAL_KEY)
			if(!ret) {
				return 0
			}
			return ret
		}

		// maxWithdrawAmount: get the total rewards fees generated by the Vault
		this.maxWithdrawAmount = async function (accountAddr) {
			let vaultBalance = await this.vaultBalance(accountAddr)
			let minted = await this.minted(accountAddr)

			let amount = vaultBalance - minted - this.minTransactionFee()
			if(amount < 0) {
				return 0
			}
			
			// if the amount leaves less than minVaultBalance, leave minVaultBalance
			if(vaultBalance - amount - this.minTransactionFee() < this.minVaultBalance()) {
				amount = vaultBalance - this.minVaultBalance() - this.minTransactionFee()
			}
			return amount
		}

		this.maxMintAmount = async function (accountAddr) {
			let vaultBalance = await this.vaultBalance(accountAddr)
			let minted = await this.minted(accountAddr)
			let fee = await this.mintFee()
			let maxAmount

			if(fee !== 0) {
				// feesToPay = maxAmount*fee/10000
				// maxAmount = vaultBalance - minted - feesToPay - minFee
				// maxAmount = vaultBalance - minted - maxAmount*fee/10000 - minFee
				// maxAmount*(1+fee/10000) = vaultBalance - minted
				// maxAmount = (vaultBalance - minted - minFee) / (1+fee/10000)
				maxAmount = Math.floor((vaultBalance - minted - this.minTransactionFee()) / (1+fee/10000))
				// rounding error can generate an error above 1 so the real maxAmount is a bit higher
				while(vaultBalance - minted - maxAmount - Math.floor(maxAmount * fee / 10000) - this.minTransactionFee() >= 1) {
					maxAmount++
				}

			}
			else {
				maxAmount = vaultBalance - minted
			}

			return maxAmount
		}

		this.vaultCompiledTEALByAddress = async function(accountAddr) {
			let program = vaultTEAL
			
			program = program.replace(/TMPL_APP_ID/g, this.appId)
			program = program.replace(/TMPL_USER_ADDRESS/g, accountAddr)

			let encoder = new TextEncoder()
			let programBytes = encoder.encode(program);

			return await this.algodClient.compile(programBytes).do()
		}

		this.signVaultTx = async function(sender, tx) {
			const compiledProgram = await this.vaultCompiledTEALByAddress(sender)
			
			let vaultProgram = new Uint8Array(Buffer.from(compiledProgram.result, "base64"))
			let lsigVault = algosdk.makeLogicSig(vaultProgram)
			let txSigned = algosdk.signLogicSigTransactionObject(tx, lsigVault)

			return txSigned
		}
		// depositALGOs
		this.depositALGOs = async function (sender, amount, signCallback) {
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			let vaultAddr = await this.vaultAddressByApp(sender)
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
			}

			// create unsigned transaction
			let txPayment = algosdk.makePaymentTxnWithSuggestedParams(sender, vaultAddr, amount, undefined, new Uint8Array(0), params)

			let signed = []
			let txPaymentSigned = signCallback(sender, txPayment)
			signed.push(txPaymentSigned);

			let tx = (await this.algodClient.sendRawTransaction(signed).do())

			return tx.txId
		}

		// mintwALGOs
		// @forceAppId: force appId to be the specified instead of the vault. Used to test.
		// @forceAssetId: force assetId to be the specified instead of wALGO. Used to test.
		this.mintwALGOs = async function (sender, amount, signCallback, forceAppId, forceAssetId) {
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			let minterAddr = await this.mintAccount()
			let vaultAddr = await this.vaultAddressByApp(sender)
			let mintFee = await this.mintFee()

			if(!minterAddr) {
				throw new Error('ERROR: Mint account not defined')
			}
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(MINT_WALGOS_OP)))

			let appAccounts = []
			appAccounts.push(vaultAddr)

			let appId = this.appId
			let assetId = this.assetId

			if(forceAppId) {
				appId = forceAppId
			}
			if(forceAssetId) {
				assetId = forceAssetId
			}

			let txPayFees

			// create unsigned transaction
			let txApp = algosdk.makeApplicationNoOpTxn(sender, params, appId, appArgs, appAccounts)
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(minterAddr, sender, undefined, undefined, amount, new Uint8Array(0), 
				assetId, params)
			let txns = [txApp, txwALGOTransfer];

			if(mintFee > 0) {
				let fees = Math.floor(mintFee * amount / 10000)
				txPayFees = algosdk.makePaymentTxnWithSuggestedParams(vaultAddr, this.adminAddr, fees, undefined, new Uint8Array(0), params)
				txns.push(txPayFees)
			}

			// Group both transactions
			algosdk.assignGroupID(txns);

			let signed = []
			let txAppSigned = signCallback(sender, txApp)
			let txwALGOTransferSigned = algosdk.signLogicSigTransactionObject(txwALGOTransfer, this.lsigMint);			

			signed.push(txAppSigned);
			signed.push(txwALGOTransferSigned.blob);

			if(txPayFees) {
				let txPayFeesSigned = await this.signVaultTx(sender, txPayFees)
				signed.push(txPayFeesSigned.blob);
			}

			let tx = (await this.algodClient.sendRawTransaction(signed).do())

			return tx.txId
		}

		// withdrawALGOs
		this.withdrawALGOs = async function (sender, amount, signCallback) {
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			let vaultAddr = await this.vaultAddressByApp(sender)
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(WITHDRAW_ALGOS_OP)))

			let appAccounts = []
			appAccounts.push (vaultAddr)

			// create unsigned transaction
			let txApp = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs, appAccounts)
			let txWithdraw = algosdk.makePaymentTxnWithSuggestedParams(vaultAddr, sender, amount, undefined, new Uint8Array(0), params)

			let txns = [txApp, txWithdraw];

			// Group both transactions
			algosdk.assignGroupID(txns);


			let signed = []
			let txAppSigned = signCallback(sender, txApp)

			let txWithdrawSigned = await this.signVaultTx(sender, txWithdraw)

			signed.push(txAppSigned);
			signed.push(txWithdrawSigned.blob);

			let tx = (await this.algodClient.sendRawTransaction(signed).do())

			return tx.txId
		}

		// burnwALGOs
		this.burnwALGOs = async function (sender, amount, signCallback, forceAssetId) {
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			let minterAddr = await this.mintAccount()
			let vaultAddr = await this.vaultAddressByApp(sender)
			let assetId = this.assetId
			let burnFee = await this.burnFee()

			if(forceAssetId) {
				assetId = forceAssetId
			}

			if(!minterAddr) {
				throw new Error('ERROR: Mint account not defined')
			}
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(BURN_ALGOS_OP)))

			let appAccounts = []
			appAccounts.push(vaultAddr)

			let txPayFees

			// create unsigned transaction
			let txApp = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs, appAccounts)
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(sender, minterAddr, undefined, undefined, amount, new Uint8Array(0), 
				assetId, params)
			let txns = [txApp, txwALGOTransfer];

			if(burnFee > 0) {
				let fees = Math.floor(burnFee * amount / 10000)
				txPayFees = algosdk.makePaymentTxnWithSuggestedParams(vaultAddr, this.adminAddr, fees, undefined, new Uint8Array(0), params)
				txns.push(txPayFees)
			}

			// Group both transactions
			algosdk.assignGroupID(txns);

			let signed = []
			let txAppSigned = signCallback(sender, txApp)
			let txwALGOTransferSigned = signCallback(sender, txwALGOTransfer)
			signed.push(txAppSigned);
			signed.push(txwALGOTransferSigned);

			if(txPayFees) {
				let txPayFeesSigned = await this.signVaultTx(sender, txPayFees)
				signed.push(txPayFeesSigned.blob);
			}

			let tx = (await this.algodClient.sendRawTransaction(signed).do())

			return tx.txId
		}

		// burnwALGOsAttack: try to burn the algos from the Minter account instead of the user trying to bypass controls. Audit report.
		this.burnwALGOsAttack = async function (sender, amount, signCallback, forceAssetId) {
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			let minterAddr = await this.mintAccount()
			let vaultAddr = await this.vaultAddressByApp(sender)
			let assetId = this.assetId
			let burnFee = await this.burnFee()

			if(forceAssetId) {
				assetId = forceAssetId
			}

			if(!minterAddr) {
				throw new Error('ERROR: Mint account not defined')
			}
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(BURN_ALGOS_OP)))

			let appAccounts = []
			appAccounts.push(vaultAddr)

			let txPayFees

			// create unsigned transaction
			let txApp = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs, appAccounts)
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(minterAddr, minterAddr, undefined, undefined, amount, new Uint8Array(0), 
				assetId, params)
			let txns = [txApp, txwALGOTransfer];

			if(burnFee > 0) {
				let fees = Math.floor(burnFee * amount / 10000)
				txPayFees = algosdk.makePaymentTxnWithSuggestedParams(vaultAddr, this.adminAddr, fees, undefined, new Uint8Array(0), params)
				txns.push(txPayFees)
			}

			// Group both transactions
			algosdk.assignGroupID(txns);

			let signed = []
			let txAppSigned = signCallback(sender, txApp)
			let txwALGOTransferSigned = algosdk.signLogicSigTransactionObject(txwALGOTransfer, this.lsigMint);			
			signed.push(txAppSigned);
			signed.push(txwALGOTransferSigned.blob);

			if(txPayFees) {
				let txPayFeesSigned = await this.signVaultTx(sender, txPayFees)
				signed.push(txPayFeesSigned.blob);
			}

			let tx = (await this.algodClient.sendRawTransaction(signed).do())

			return tx.txId
		}

		// closeOut
		// @forceTo: force To address to be the specified instead of the vault admin. Used to test.
		// @forceClose: force Close address to be the specified instead of the vault admin. Used to test.
		// @forceToAmount: force the withdrawal of the specified amount instead of calculating it automatically. Used to test.
		this.closeOut = async function (sender, signCallback, forceTo, forceToAmount, forceClose) {
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			let vaultAddr = await this.vaultAddressByApp(sender)
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
			}

			let toAmount = 0
			let vaultBalance = await this.vaultBalance(sender)
			
			// if there is no balance just ClearApp
			if(vaultBalance === 0) {
				return (await this.clearApp(sender, signCallback))
			}

			if(forceToAmount) {
				toAmount = forceToAmount
			}

			let toAddr = sender
			let closeAddr = sender

			if(forceTo) {
				toAddr = forceTo
			}
			if(forceClose) {
				closeAddr = forceClose
			}
			
			let appAccounts = []
			appAccounts.push(vaultAddr)

			// create unsigned transaction
			const txApp = algosdk.makeApplicationCloseOutTxn(sender, params, this.appId, undefined, appAccounts)
			let txWithdraw = algosdk.makePaymentTxnWithSuggestedParams(vaultAddr, toAddr, toAmount, closeAddr, 
																																	new Uint8Array(0), params)
	
			let txns = [txApp, txWithdraw];

			// Group both transactions
			algosdk.assignGroupID(txns);

			let signed = []
			let txAppSigned = signCallback(sender, txApp)
			let txWithdrawSigned = await this.signVaultTx(sender, txWithdraw)

			signed.push(txAppSigned);
			signed.push(txWithdrawSigned.blob);

			let tx = (await this.algodClient.sendRawTransaction(signed).do())

			return tx.txId
		}

		// call application
		this.callApp = async function (sender, appArgs, appAccounts, signCallback) {
			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			// create unsigned transaction
			const txApp = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs, appAccounts)
			const txId = txApp.txID().toString()

			// Sign the transaction
			let txAppSigned = signCallback(sender, txApp)

			// Submit the transaction
			await this.algodClient.sendRawTransaction(txAppSigned).do()

			return txId
		}
		
		this.setMintAccountAttack = async function (sender, mintAddr, accountAddr, signCallback) {
			let appArgs = []
			appArgs.push(new Uint8Array(Buffer.from(SET_MINT_ACCOUNT_OP)))
			let appAccounts = []
			appAccounts.push (mintAddr)

			return await this.testCallAppAttack(sender, appArgs, appAccounts, accountAddr, signCallback)
		}
		
		// updateAppAttack: simulate a mintwALGO operation and update the code. Audit Report.
		this.updateAppAttack = async function (sender, amount, signCallback) {
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			let minterAddr = await this.mintAccount()
			let vaultAddr = await this.vaultAddressByApp(sender)
			let mintFee = await this.mintFee()

			if(!minterAddr) {
				throw new Error('ERROR: Mint account not defined')
			}
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(MINT_WALGOS_OP)))

			let appAccounts = []
			appAccounts.push(vaultAddr)

			let assetId = this.assetId

			let txPayFees

			let approvalProgramCompiled = await this.compileApprovalProgram()
			let clearProgramCompiled = await this.compileClearProgram()

			// create unsigned transaction
			const txApp = algosdk.makeApplicationUpdateTxn(sender, params, this.appId, approvalProgramCompiled, clearProgramCompiled, appArgs, appAccounts)
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(minterAddr, sender, undefined, undefined, amount, new Uint8Array(0), 
				assetId, params)
			let txns = [txApp, txwALGOTransfer];

			if(mintFee > 0) {
				let fees = Math.floor(mintFee * amount / 10000)
				txPayFees = algosdk.makePaymentTxnWithSuggestedParams(vaultAddr, this.adminAddr, fees, undefined, new Uint8Array(0), params)
				txns.push(txPayFees)
			}

			// Group both transactions
			algosdk.assignGroupID(txns);

			let signed = []
			let txAppSigned = signCallback(sender, txApp)
			let txwALGOTransferSigned = algosdk.signLogicSigTransactionObject(txwALGOTransfer, this.lsigMint);			

			signed.push(txAppSigned);
			signed.push(txwALGOTransferSigned.blob);

			if(txPayFees) {
				let txPayFeesSigned = await this.signVaultTx(sender, txPayFees)
				signed.push(txPayFeesSigned.blob);
			}

			let tx = (await this.algodClient.sendRawTransaction(signed).do())

			return tx.txId
		}

		// clearStateAttack: create a clearState transaction from the vault to bypass vault.teal controls and withdraw algos from the vault. Audit report.
		this.clearStateAttack = async function (sender, vaultOwnerAddr, amount, signCallback) {
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			let vaultAddr = await this.vaultAddressByApp(vaultOwnerAddr)
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(WITHDRAW_ALGOS_OP)))

			let appAccounts = []
			appAccounts.push(vaultAddr)

			// create unsigned transaction
			let txApp = algosdk.makeApplicationClearStateTxn(sender, params, this.appId, appArgs, appAccounts)
			let txWithdraw = algosdk.makePaymentTxnWithSuggestedParams(vaultAddr, sender, amount, undefined, new Uint8Array(0), params)

			let txns = [txApp, txWithdraw];

			// Group both transactions
			algosdk.assignGroupID(txns);


			let signed = []
			let txAppSigned = signCallback(sender, txApp)

			let txWithdrawSigned = await this.signVaultTx(vaultOwnerAddr, txWithdraw)

			signed.push(txAppSigned);
			signed.push(txWithdrawSigned.blob);

			let tx = (await this.algodClient.sendRawTransaction(signed).do())

			return tx.txId
		}

		// setMintAccountAttack: attach an additional transaction to the App Call to try to withdraw algos from a Vault.
		// if the TEAL code does not verify the GroupSize correctly the Vault TEAL will approve the tx 
		this.testCallAppAttack = async function (sender, appArgs, appAccounts, attackAccountAddr, signCallback) {
			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			let vaultAddr = await this.vaultAddressByApp(attackAccountAddr)
			if(!vaultAddr) {
				throw new Error('ERROR: Account not opted in')
			}
	
			// create unsigned transaction
			const txApp = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs, appAccounts)
			let txWithdraw = algosdk.makePaymentTxnWithSuggestedParams(vaultAddr, sender, 10000, undefined, new Uint8Array(0), params)
			let txns = [txApp, txWithdraw];

			// Group both transactions
			algosdk.assignGroupID(txns);

			const compiledProgram = await this.vaultCompiledTEALByAddress(attackAccountAddr)

			let vaultProgram = new Uint8Array(Buffer.from(compiledProgram.result, "base64"));

			let lsigVault = algosdk.makeLogicSig(vaultProgram);

			let signed = []
			let txAppSigned = signCallback(sender, txApp)
			let txWithdrawSigned = algosdk.signLogicSigTransactionObject(txWithdraw, lsigVault);
			signed.push(txAppSigned);
			signed.push(txWithdrawSigned.blob);

			let tx = (await this.algodClient.sendRawTransaction(signed).do())

			return tx.txId
		}

		this.clearApp = async function (sender, signCallback) {
			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			// create unsigned transaction
			const txApp = algosdk.makeApplicationClearStateTxn(sender, params, this.appId)
			const txId = txApp.txID().toString()

			// Sign the transaction
			let txAppSigned = signCallback(sender, txApp)

			// Submit the transaction
			await this.algodClient.sendRawTransaction(txAppSigned).do()

			return txId
		}

		this.updateApp = async function (sender, signCallback) {
			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			let approvalProgramCompiled = await this.compileApprovalProgram()
			let clearProgramCompiled = await this.compileClearProgram()

			// create unsigned transaction
			const txApp = algosdk.makeApplicationUpdateTxn(sender, params, this.appId, approvalProgramCompiled, clearProgramCompiled)
			const txId = txApp.txID().toString()

			// Sign the transaction
			let txAppSigned = signCallback(sender, txApp)

			// Submit the transaction
			await this.algodClient.sendRawTransaction(txAppSigned).do()

			return txId
		}


		this.deleteApp = async function (sender, signCallback, appId) {
			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do()

			params.fee = this.minFee
			params.flatFee = true

			if(!appId) {
				appId = this.appId
			}
			// create unsigned transaction
			const txApp = algosdk.makeApplicationDeleteTxn(sender, params, appId)
			const txId = txApp.txID().toString()

			// Sign the transaction
			let txAppSigned = signCallback(sender, txApp)

			// Submit the transaction
			await this.algodClient.sendRawTransaction(txAppSigned).do()

			return txId
		}

	}
}

module.exports = { 
	VaultManager
}

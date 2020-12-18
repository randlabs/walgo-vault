const algosdk = require('algosdk');
const fs = require('fs');
const tools = require('./tools');

const approvalProgramFilename = 'app-vault.teal.tmpl';
const clearProgramFilename = 'app-vault-clear-state.teal';

const vaultProgramFilename = 'vault.teal.tmpl';
const minterProgramFilename = 'minter.teal.tmpl';

const GLOBAL_STATUS_GLOBAL_KEY = 'GS';
const ADMIN_ACCOUNT_GLOBAL_KEY = 'A';
const MINT_ACCOUNT_GLOBAL_KEY = 'MA';
const MINT_FEE_GLOBAL_KEY = 'MF';
const BURN_FEE_GLOBAL_KEY = 'BF';
const CREATION_FEE_GLOBAL_KEY = 'CF';

const VAULT_ACCOUNT_LOCAL_KEY = 'v';
const MINTED_LOCAL_KEY = 'm';
const VAULT_STATUS_LOCAL_KEY = 's';

const MINT_WALGOS_OP = 'mw';
const WITHDRAW_ALGOS_OP = 'wA';
const BURN_ALGOS_OP = 'bw';

const INITIALIZE_APP_OP = 'iA';
const SET_ADMIN_ACCOUNT_OP = 'sAA';
const SET_ACCOUNT_STATUS_OP = 'sAS';
const SET_GLOBAL_STATUS_OP = 'sGS';
const SET_MINT_ACCOUNT_OP = 'sMA';
const SET_MINT_FEE_OP = 'sMF';
const SET_BURN_FEE_OP = 'sBF';
const SET_CREATION_FEE_OP = 'sCF';

let vaultTEAL;
let minterTEAL;


class VaultManager {
	constructor (algodClient, appId = 0, adminAddr = undefined, assetId = 0) {
		this.algodClient = algodClient;
		this.appId = appId;
		this.adminAddr = adminAddr;
		this.assetId = assetId;
		this.lsigMint = undefined;
		this.algodClient = algodClient;
		this.vaultMinBalance = 100000;
		this.minFee = 1000;

		/**
		 * Set Application Id used in all the functions of this class.
		 * @param  {Number} applicationId [application id]
		 * @return {String} void
		 */
		this.setAppId = function (applicationId) {
			this.appId = applicationId;
		};

		/**
		 * Set the wALGO asset id used in all the functions of this class.
		 * @param  {Number} asaId [asset id]
		 * @return {String} void
		 */
		this.setAssetId = function (asaId) {
			this.assetId = asaId;
		};

		/**
		 * Set application creator. It is used to retrieve application global state.
		 * @param  {String} creatorAddr application creator address
		 * @return {String} void
		 */
		this.setCreator = function (creatorAddr) {
			this.adminAddr = creatorAddr;
		};

		/**
		 * Get minimum balance of the vault accounts.
		 * @return {[Number]}      minimum balance of vaults
		 */
		this.minVaultBalance = function() {
			return this.vaultMinBalance;
		};

		/**
		 * Get minimum fee to pay for transactions.
		 * @return {[Number]}      minimum transaction fee
		 */
		this.minTransactionFee = function() {
			return this.minFee;
		};

		/**
		 * Internal function.
		 * Read application local state related to the account.
		 * @param  {String} accountAddr account to retrieve local state
		 * @return {Array} an array containing all the {key: value} pairs of the local state
		 */
		this.readLocalState = function (accountAddr) {
			return tools.readAppLocalState(this.algodClient, this.appId, accountAddr);
		};

		/**
		 * Internal function.
		 * Read application global state.
		 * @return {Array}  an array containing all the {key: value} pairs of the global state
		 */
		this.readGlobalState = function () {
			return tools.readAppGlobalState(this.algodClient, this.appId, this.adminAddr);
		};

		/**
		 * Print local state of accountAddr on stdout.
		 * @param  {String} accountAddr account to retrieve local state
		 * @return {VOID} VOID
		 */
		this.printLocalState = async function (accountAddr) {
			await tools.printAppLocalState(this.algodClient, this.appId, accountAddr);
		};

		/**
		 * Print application global state on stdout.
		 * @return {VOID} VOID
		 */
		this.printGlobalState = async function () {
			await tools.printAppGlobalState(this.algodClient, this.appId, this.adminAddr);
		};

		/**
		 * Internal function.
		 * Read application local state variable related to accountAddr.
		 * @param  {String} accountAddr account to retrieve local state
		 * @param  {String} key variable key to get the value associated
		 * @return {String/Number} it returns the value associated to the key that could be
		 * an address, a number or a base64 string containing a ByteArray
		 */
		this.readLocalStateByKey = function (accountAddr, key) {
			return tools.readAppLocalStateByKey(this.algodClient, this.appId, accountAddr, key);
		};

		/**
		 * Internal function.
		 * Read application global state variable.
		 * @param  {String} key variable key to get the value associated
		 * @return {String/Number} it returns the value associated to the key that
		 * could be an address, a number or a base64 string containing a ByteArray
		 */
		this.readGlobalStateByKey = function (key) {
			return tools.readAppGlobalStateByKey(this.algodClient, this.appId, this.adminAddr, key);
		};

		/**
		 * Get Vault balance related to accountAddr.
		 * @param  {String} accountAddr account to retrieve balance
		 * @return {Number}      balance of the Vault account associated with accountAddr
		 */
		this.vaultBalance = async function (accountAddr) {
			let vaultAddr = await this.vaultAddressByTEAL(accountAddr);
			let accountInfo = await this.algodClient.accountInformation(vaultAddr).do();
			return accountInfo.amount;
		};

		/**
		 * Get Vault address associated to accountAddr based on the application local state.
		 * It only works when accountAddr opted in the application.
		 * @param  {String} accountAddr account to retrieve balance
		 * @return {String} Vault address associated to accountAddr if it opted in the application, otherwise undefined
		 */
		this.vaultAddressByApp = function (accountAddr) {
			return this.readLocalStateByKey(accountAddr, VAULT_ACCOUNT_LOCAL_KEY);
		};

		/**
		 * Get Vault address associated to accountAddr compiling the code of its Vault.
		 * This function calculates the address in the same way the Vault Application does and does not require opt in.
		 * @param  {String} accountAddr account to retrieve balance
		 * @return {String}      Vault address associated to accountAddr
		 */
		this.vaultAddressByTEAL = async function (accountAddr) {
			let compiledProgram = (await this.vaultCompiledTEALByAddress(accountAddr));
			return compiledProgram.hash;
		};

		/**
		 * Helper function to wait until transaction txId is included in a block/round.
		 * @param  {String} txId transaction id to wait for
		 * @return {VOID} VOID
		 */
		this.waitForConfirmation = async function (txId) {
			const status = (await this.algodClient.status().do());
			let lastRound = status['last-round'];
			// eslint-disable-next-line no-constant-condition
			while (true) {
				const pendingInfo = await this.algodClient.pendingTransactionInformation(txId).do();
				if (pendingInfo['confirmed-round'] !== null && pendingInfo['confirmed-round'] > 0) {
					// Got the completed Transaction

					return pendingInfo['confirmed-round'];
				}
				lastRound += 1;
				await this.algodClient.statusAfterBlock(lastRound).do();
			}
		};

		/**
		 * Helper function to wait until transaction txId is included in a block/round
		 * and returns the transaction response associated to the transaction.
		 * @param  {String} txId transaction id to get transaction response
		 * @return {Object}      returns an object containing response information
		 */
		this.waitForTransactionResponse = async function (txId) {
			// Wait for confirmation
			await this.waitForConfirmation(txId);

			// display results
			return this.algodClient.pendingTransactionInformation(txId).do();
		};

		/**
		 * Verify if transactionResponse has any information about a transaction local or global state change.
		 * @param  {Object} transactionResponse object containing the transaction response of an application call
		 * @return {Boolean} returns true if there is a local or global delta meanining
		 * that the transaction made a change in the local or global state
		 */
		this.anyAppCallDelta = function(transactionResponse) {
			return (transactionResponse['global-state-delta'] || transactionResponse['local-state-delta']);
		};

		/**
		 * Print to stdout the changes introduced by the transaction that generated the transactionResponse if any.
		 * @param  {Object} transactionResponse object containing the transaction response of an application call
		 * @return {String} void
		 */
		this.printAppCallDelta = function(transactionResponse) {
			if (transactionResponse['global-state-delta'] !== undefined) {
				console.log('Global State updated:');
				tools.printAppCallDeltaArray(transactionResponse['global-state-delta']);
			}
			if (transactionResponse['local-state-delta'] !== undefined) {
				console.log('Local State updated:');
				tools.printAppCallDeltaArray(transactionResponse['local-state-delta']);
			}
		};

		/**
		 * Compile program that programFilename contains.
		 * @param  {String} programFilename filepath to the program to compile
		 * @return {[String]}      base64 string containing the compiled program
		 */
		this.compileProgram = async function (programFilename) {
			// eslint-disable-next-line security/detect-non-literal-fs-filename
			const programBytes = fs.readFileSync(programFilename);
			const compileResponse = await this.algodClient.compile(programBytes).do();
			const compiledBytes = new Uint8Array(Buffer.from(compileResponse.result, 'base64'));
			return compiledBytes;
		};

		/**
		 * Internal function.
		 * Compile application clear state program.
		 * @return {[String]}      base64 string containing the compiled program
		 */
		this.compileClearProgram = function () {
			return this.compileProgram(clearProgramFilename);
		};

		/**
		 * Internal function.
		 * Compile vault.teal and return the begining part (Prefix) and the last part (Suffix).
		 * In the middle, is the user account that changes for each user opting in.
		 * @return {[String]}      base64 string containing the compiled program
		 */
		this.vaultProgramPrefixSuffix = async function() {
			// use any address to replace in the template
			const compiledVaultProgram = await this.vaultCompiledTEALByAddress(this.adminAddr);

			let buffer = Buffer.from(compiledVaultProgram.result, 'base64');
			let compiledVaultProgramHex = buffer.toString('hex');

			let prefix = compiledVaultProgramHex.substring(0, 24);
			let suffix = compiledVaultProgramHex.substring(88);

			let ret = {};

			buffer = Buffer.from(prefix, 'hex');
			ret.prefixBase64 = buffer.toString('base64');
			buffer = Buffer.from(suffix, 'hex');
			ret.suffixBase64 = buffer.toString('base64');

			return ret;
		};

		/**
		 * Internal function.
		 * Compile application approval program.
		 * @return {[String]}      base64 string containing the compiled program
		 */
		this.compileApprovalProgram = async function () {
			// eslint-disable-next-line security/detect-non-literal-fs-filename
			let program = fs.readFileSync(approvalProgramFilename, 'utf8');

			let encoder = new TextEncoder();
			let programBytes = encoder.encode(program);

			const compileResponse = await this.algodClient.compile(programBytes).do();
			const compiledBytes = new Uint8Array(Buffer.from(compileResponse.result, 'base64'));
			return compiledBytes;
		};

		/**
		 * Helper function to retrieve the application id from a createApp transaction response.
		 * @param  {Object} txResponse object containig the transactionResponse of the createApp call
		 * @return {Number}      application id of the created application
		 */
		this.appIdFromCreateAppResponse = function(txResponse) {
			return txResponse["application-index"];
		};

		/**
		 * Create an application based on the default approval and clearState programs or based on the specified files.
		 * @param  {String} sender account used to sign the createApp transaction
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions.
		 * If not specified, it returns a transaction object
		 * @param  {String} approvalCodeFile optional. If it is not specified it uses the default Vault app approval code
		 * @param  {String} clearCodeFile optional. If it is not specified it uses the default Vault app clearState code
		 * @return {String}      transaction id of the created application or a transaction object if signCallback is not specified
		 */
		this.createApp = async function (sender, signCallback, approvalCodeFile, clearCodeFile) {
			const localInts = 3;
			const localBytes = 2;
			const globalInts = 5;
			const globalBytes = 5;

			// declare onComplete as NoOp
			const onComplete = algosdk.OnApplicationComplete.NoOpOC;

			// get node suggested parameters
			const params = await algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			let approvalProgramCompiled;
			let clearProgramCompiled;

			if (approvalCodeFile) {
				approvalProgramCompiled = await this.compileProgram(approvalCodeFile);
			}
			else {
				approvalProgramCompiled = await this.compileApprovalProgram();
			}
			if (clearCodeFile) {
				clearProgramCompiled = await this.compileProgram(clearCodeFile);
			}
			else {
				clearProgramCompiled = await this.compileClearProgram();
			}

			// create unsigned transaction
			const txApp = algosdk.makeApplicationCreateTxn(
				sender, params, onComplete,
				approvalProgramCompiled, clearProgramCompiled,
				localInts, localBytes, globalInts, globalBytes
			);
			const txId = txApp.txID().toString();

			if (!signCallback) {
				return txApp;
			}

			// Sign the transaction
			let txAppSigned = signCallback(sender, txApp);
			//const txAppSigned = txApp.signTxn(adminAccount.sk)

			// Submit the transaction
			await algodClient.sendRawTransaction(txAppSigned).do();
			return txId;
		};

		/**
		 * Initialize the application setting the appId, vault Prefix and vault Suffix.
		 * @param  {String} sender account used to sign the createApp transaction
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions.
		 * If not specified, it returns a transaction object
		 * @return {[String]}      transaction id of the created application or a transaction object if signCallback is not specified
		 */
		this.initializeApp = async function(sender, signCallback) {
			let vaultProgram = await this.vaultProgramPrefixSuffix();

			// initialize(wALGOId, vaultPrefix, vaultSuffix)
			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(INITIALIZE_APP_OP)));
			appArgs.push(new Uint8Array(tools.getInt64Bytes(this.assetId)));
			appArgs.push(new Uint8Array(Buffer.from(vaultProgram.prefixBase64, "base64")));
			appArgs.push(new Uint8Array(Buffer.from(vaultProgram.suffixBase64, "base64")));

			return this.callApp(sender, appArgs, undefined, signCallback);
		};

		/**
		 * Create a logicSig object that can be used to mint wALGOs, used in mintwALGOs operation.
		 * The sender is the minter account holding wALGOs.
		 * @param  {String} sender minter account used to sign the teal program
		 * @param  {Function} lsigCallback callback with prototype lsigCallback(sender, lsig) used to sign logicSig object
		 * @return {Class}      signed logicSig object
		 */
		this.createDelegatedMintAccount = async function(sender, lsigCallback) {
			if (!minterTEAL) {
				// eslint-disable-next-line security/detect-non-literal-fs-filename
				minterTEAL = fs.readFileSync(minterProgramFilename, 'utf8');
			}

			let program = minterTEAL;

			// eslint-disable-next-line require-unicode-regexp
			program = program.replace(/TMPL_APP_ID/g, this.appId);
			// eslint-disable-next-line require-unicode-regexp
			program = program.replace(/TMPL_ASA_ID/g, this.assetId);

			let encoder = new TextEncoder();
			let programBytes = encoder.encode(program);

			let compiledProgram = await this.algodClient.compile(programBytes).do();

			let minterProgram = new Uint8Array(Buffer.from(compiledProgram.result, "base64"));

			let lsigMinter = algosdk.makeLogicSig(minterProgram);

			await lsigCallback(sender, lsigMinter);

			return lsigMinter;
		};

		/**
		 * Use the logicSig minter delegation signed teal from filepath to mint algos in mintwALGOs operations
		 * Priving a signed delegated logicSig calling delegateMintAccount or delegateMintAccountFromFile is required to use mintwALGOs.
		 * Use it in combination with createDelegatedMintAccountToFile.
		 * @param  {String} filepath filepath of the signed minter teal code
		 * @return {VOID} VOID
		 */
		this.delegateMintAccountFromFile = function(filepath) {
			// eslint-disable-next-line security/detect-non-literal-fs-filename
			let lsiguintArray = fs.readFileSync(filepath);
			let lsigb64 = lsiguintArray.toString();

			let lsigEncoded = new Uint8Array(Buffer.from(lsigb64, "base64"));

			let lsigDecoded = algosdk.decodeObj(lsigEncoded);

			let lsigDelegatedReconst = algosdk.makeLogicSig(lsigDecoded.l, lsigDecoded.arg);
			lsigDelegatedReconst.sig = lsigDecoded.sig;
			lsigDelegatedReconst.msig = lsigDecoded.msig;

			this.delegateMintAccount(lsigDelegatedReconst);
		};

		/**
		 * Create a logicSig object that can be used to mint wALGOs and write it to filepath. It uses application minter account as signer.
		 * @param  {String} filepath output file where the signed TEAL is stored
		 * @param  {Function} lsigCallback callback with prototype lsigCallback(sender, lsig) used to sign logicSig object
		 * @return {String} void
		 */
		this.createDelegatedMintAccountToFile = async function(filepath, lsigCallback) {
			let minterAddr = await this.mintAccount();
			let lsigDelegatedBuf = await this.createDelegatedMintAccount(minterAddr, lsigCallback);

			let encodedObj = lsigDelegatedBuf.get_obj_for_encoding();
			let lsigEncoded = algosdk.encodeObj(encodedObj);
			let lsigb64 = Buffer.from(lsigEncoded).toString('base64');
			// eslint-disable-next-line security/detect-non-literal-fs-filename
			fs.writeFileSync(filepath, lsigb64);
		};

		/**
		 * Delegate wALGO minting using a logicSig signed by the minter account.
		 * Priving a signed delegated logicSig calling delegateMintAccount or delegateMintAccountFromFile is required to use mintwALGOs.
		 * @param  {Object} lsigMint logicSig signed by minter account that will be used in mintwALGOs operations
		 * @return {String} void
		 */
		this.delegateMintAccount = function(lsigMint) {
			this.lsigMint = lsigMint;
		};

		/**
		 * OptIn sender to application.
		 * @param  {String} sender account to optIn
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @param  {Number} forceCreationFee optional. Amount to use as fee. By default MinTxnFee
		 * @param  {Function} forceFeeTo optional. Force To address used to pay the creationFee
		 * instead of using the Admin. Useful to test
		 * @return {String}      transaction id of one of the transactions in the transaction group
		 */
		this.optIn = async function (sender, signCallback, forceCreationFee, forceFeeTo) {
			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			let vaultAddr = await this.vaultAddressByTEAL(sender);
			let fee = await this.creationFee();
			let toAddr = this.adminAddr;

			if (forceFeeTo) {
				toAddr = forceFeeTo;
			}
			if (forceCreationFee) {
				fee = forceCreationFee;
			}

			let appAccounts = [];
			appAccounts.push(vaultAddr);

			// create unsigned transaction
			const txApp = await algosdk.makeApplicationOptInTxn(sender, params, this.appId, undefined, appAccounts);

			if (fee !== 0) {
				// pay the fees
				let txPayment = algosdk.makePaymentTxnWithSuggestedParams(sender, toAddr, fee, undefined, new Uint8Array(0), params);
				let txns = [ txApp, txPayment ];

				// Group both transactions
				algosdk.assignGroupID(txns);

				let signed = [];
				let txAppSigned = signCallback(sender, txApp);
				let txPaymentSigned = signCallback(sender, txPayment);

				signed.push(txAppSigned);
				signed.push(txPaymentSigned);

				let tx = (await this.algodClient.sendRawTransaction(signed).do());

				return tx.txId;
			}

			const txId = txApp.txID().toString();

			// Sign the transaction
			let txAppSigned = signCallback(sender, txApp);
			//const txAppSigned = txApp.signTxn(account.sk)

			// Submit the transaction
			await this.algodClient.sendRawTransaction(txAppSigned).do();

			return txId;

		};

		/**
		 * Get asset balance of accountAddr. By default gets wALGO balance.
		 * @param  {String} accountAddr account to get asset balance
		 * @param  {Number} forceAssetId optional. Asset id to retrieve balance. By default, the asset id set as wALGO
		 * @return {Number}      balance of wALGO or the specified asset id
		 */
		this.assetBalance = async function(accountAddr, forceAssetId) {
			let response = await this.algodClient.accountInformation(accountAddr).do();
			let asaId = this.assetId;

			if (forceAssetId) {
				asaId = forceAssetId;
			}

			for (let i = 0; i < response.assets.length; i++) {
				if (response.assets[i]["asset-id"] == asaId) {
					return response.assets[i].amount;
				}
			}
			return 0;
		};

		/**
		 * Get accountAddr balance in algos.
		 * @param  {String} accountAddr account to get algo balance
		 * @return {[Number]}      balance in algos
		 */
		this.accountBalance = async function(accountAddr) {
			let response = await this.algodClient.accountInformation(accountAddr).do();
			return response.amount;
		};

		/**
		 * Transfer algos
		 * @param  {String} sender From address
		 * @param  {String} destAddr To address
		 * @param  {Number} amount amount in algos to transfer
		 * @param  {String} closeAddr optional. CloseRemainderTo address to send all remaining algos
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions.
		 * If not specified, it returns a transaction object
		 * @return {String}      transaction id of the created application or a transaction object if signCallback is not specified
		 */
		this.transferAlgos = async function (sender, destAddr, amount, closeAddr, signCallback) {
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			// create unsigned transaction
			let txALGOTransfer = algosdk.makePaymentTxnWithSuggestedParams(
				sender, destAddr, amount, closeAddr,
				new Uint8Array(0), params
			);
			if (!signCallback) {
				return txALGOTransfer;
			}

			let txALGOTransferSigned = signCallback(sender, txALGOTransfer);

			let tx = (await this.algodClient.sendRawTransaction(txALGOTransferSigned).do());

			return tx.txId;
		};

		/**
		 * Transfer asset. By default, it transfers wALGOs.
		 * @param  {String} sender From address
		 * @param  {String} destAddr To address
		 * @param  {Number} amount amount of assets to transfer
		 * @param  {String} closeAddr optional. CloseRemainderTo address to send all remaining assets
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @param  {Number} forceAssetId optional. Assset id to use instead of the default wALGO
		 * @return {[String]}      transaction id of the transaction
		 */
		this.transferAsset = async function (sender, destAddr, amount, closeAddr, signCallback, forceAssetId) {
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			let asaId = this.assetId;

			if (forceAssetId) {
				asaId = forceAssetId;
			}

			// create unsigned transaction
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(
				sender, destAddr, closeAddr,
				undefined, amount, new Uint8Array(0), asaId, params
			);
			let txwALGOTransferSigned = signCallback(sender, txwALGOTransfer);

			let tx = (await this.algodClient.sendRawTransaction(txwALGOTransferSigned).do());

			return tx.txId;
		};

		/**
		 * OptIn to asset. By default, optIn to wALGO.
		 * @param  {String} sender account to optIn
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @param  {Number} forceAssetId optional. Assset id to use instead of the default wALGO
		 * @return {String}      transaction id of the transaction
		 */
		this.optInASA = async function (sender, signCallback, forceAssetId) {
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			let asaId = this.assetId;

			if (forceAssetId) {
				asaId = forceAssetId;
			}

			// create unsigned transaction
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(
				sender, sender, undefined,
				undefined, 0, new Uint8Array(0), asaId, params
			);

			let txwALGOTransferSigned = signCallback(sender, txwALGOTransfer);

			let tx = (await this.algodClient.sendRawTransaction(txwALGOTransferSigned).do());

			return tx.txId;
		};

		/**
		 * Change admin account to newAdminAddr.
		 * @param  {String} sender current admin account
		 * @param  {String} newAdminAddr new admin account
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions.
		 * If not specified, it returns a transaction object
		 * @return {[String]}      transaction id of the created application or a transaction object if signCallback is not specified
		 */
		this.setAdminAccount = function (sender, newAdminAddr, signCallback) {
			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(SET_ADMIN_ACCOUNT_OP)));
			let appAccounts = [];
			appAccounts.push(newAdminAddr);

			return this.callApp(sender, appArgs, appAccounts, signCallback);
		};

		/**
		 * Get admin account from the application global state.
		 * @return {String}      current admin account
		 */
		this.adminAccount = async function () {
			let ret = await this.readGlobalStateByKey(ADMIN_ACCOUNT_GLOBAL_KEY);
			if (!ret) {
				return 0;
			}
			return ret;
		};

		/**
		 * Change minter account to mintAddr.
		 * @param  {String} sender admin account
		 * @param  {String} mintAddr new minter account
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions.
		 * If not specified, it returns a transaction object
		 * @return {[String]}      transaction id of the created application or a transaction object if signCallback is not specified
		 */
		this.setMintAccount = function (sender, mintAddr, signCallback) {
			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(SET_MINT_ACCOUNT_OP)));
			let appAccounts = [];
			appAccounts.push(mintAddr);

			return this.callApp(sender, appArgs, appAccounts, signCallback);
		};

		/**
		 * Get minter account.
		 * @return {[String]}      current minter account
		 */
		this.mintAccount = async function () {
			let ret = await this.readGlobalStateByKey(MINT_ACCOUNT_GLOBAL_KEY);
			if (!ret) {
				return 0;
			}
			return ret;
		};

		/**
		 * Set mint fee paid every mintwALGOs operation. It has to be a number between 0-5000 meaning 0%-50%.
		 * @param  {String} sender admin account
		 * @param  {Number} newFee new mint fee
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions.
		 * If not specified, it returns a transaction object
		 * @return {[String]}      transaction id of the created application or a transaction object if signCallback is not specified
		 */
		this.setMintFee = function (sender, newFee, signCallback) {
			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(SET_MINT_FEE_OP)));
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newFee)));

			return this.callApp(sender, appArgs, undefined, signCallback);
		};

		/**
		 * Get mint fee.
		 * @return {[Number]}      current mint fee
		 */
		this.mintFee = async function () {
			let ret = await this.readGlobalStateByKey(MINT_FEE_GLOBAL_KEY);
			if (!ret) {
				return 0;
			}
			return ret;
		};

		/**
		 * Set burn fee paid every burnwALGOs operation. It has to be a number between 0-5000 meaning 0%-50%.
		 * @param  {String} sender admin account
		 * @param  {Number} newFee new burn fee
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions.
		 * If not specified, it returns a transaction object
		 * @return {[String]}      transaction id of the created application or a transaction object if signCallback is not specified
		 */
		this.setBurnFee = function (sender, newFee, signCallback) {
			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(SET_BURN_FEE_OP)));
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newFee)));

			return this.callApp(sender, appArgs, undefined, signCallback);
		};

		/**
		 * Get burn fee.
		 * @return {[Number]}      current burn fee
		 */
		this.burnFee = async function () {
			let ret = await this.readGlobalStateByKey(BURN_FEE_GLOBAL_KEY);
			if (!ret) {
				return 0;
			}
			return ret;
		};

		/**
		 * Set creation fee in microalgos paid by accounts opting in.
		 * @param  {String} sender admin account
		 * @param  {Number} newFee new creation fee in microalgos
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions.
		 * If not specified, it returns a transaction object
		 * @return {[String]}      transaction id of the created application or a transaction object if signCallback is not specified
		 */
		this.setCreationFee = function (sender, newFee, signCallback) {
			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(SET_CREATION_FEE_OP)));
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newFee)));

			return this.callApp(sender, appArgs, undefined, signCallback);
		};

		/**
		 * Get creation fee in algos.
		 * @return {Number}      current creation fee in algos
		 */
		this.creationFee = async function () {
			let ret = await this.readGlobalStateByKey(CREATION_FEE_GLOBAL_KEY);
			if (!ret) {
				return 0;
			}
			return ret;
		};

		/**
		 * Set application global status. If disabled, accounts cannot make any operation, only admin operations are allowed
		 * 0: disabled.
		 * 1: enabled.
		 * @param  {String} sender admin account
		 * @param  {Number} newStatus 0 or 1
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions.
		 * If not specified, it returns a transaction object
		 * @return {[String]}      transaction id of the created application or a transaction object if signCallback is not specified
		 */
		this.setGlobalStatus = function (sender, newStatus, signCallback) {
			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(SET_GLOBAL_STATUS_OP)));
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newStatus)));

			return this.callApp(sender, appArgs, undefined, signCallback);
		};

		/**
		 * Get application global status. If disabled, accounts cannot make any operation, only admin operations are allowed
		 * @return {[Number]}      0 if disabled or 1 if enabled
		 */
		this.globalStatus = function () {
			let ret = this.readGlobalStateByKey(GLOBAL_STATUS_GLOBAL_KEY);
			if (!ret) {
				return 0;
			}
			return ret;
		};

		/**
		 * Set application accountAddr status. If disabled, the account cannot make any operation.
		 * 0: disabled.
		 * 1: enabled.
		 * @param  {String} sender admin account
		 * @param  {String} accountAddr account to set the status
		 * @param  {Number} newStatus 0 or 1
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions.
		 * If not specified, it returns a transaction object
		 * @return {String}      transaction id of the created application or a transaction object if signCallback is not specified
		 */
		this.setAccountStatus = function (sender, accountAddr, newStatus, signCallback) {
			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(SET_ACCOUNT_STATUS_OP)));
			appArgs.push(new Uint8Array(tools.getInt64Bytes(newStatus)));

			let appAccounts = [];
			appAccounts.push(accountAddr);

			return this.callApp(sender, appArgs, appAccounts, signCallback);
		};

		/**
		 * Get application accountAddr status. If disabled, the account cannot make any operation.
		 * @param  {String} accountAddr account to get the status
		 * @return {Number}      0 if disabled or 1 if enabled
		 */
		this.accountStatus = async function (accountAddr) {
			let ret = await this.readLocalStateByKey(accountAddr, VAULT_STATUS_LOCAL_KEY);
			if (!ret) {
				return 0;
			}
			return ret;
		};

		/**
		 * Get the amount of wALGOs minted for accountAddr. It returns net minted, only the amount of wALGOs owed.
		 * @param  {String} accountAddr account to get the minted amount
		 * @return {Number}      net minted by accountAddr
		 */
		this.minted = async function (accountAddr) {
			let ret = await this.readLocalStateByKey(accountAddr, MINTED_LOCAL_KEY);
			if (!ret) {
				return 0;
			}
			return ret;
		};

		/**
		 * Get the maximum amount of algos that accountAddr can withdraw from its Vault.
		 * It calculates the amount, based on the minted wALGOs and the transaction fees to pay in the withdrawal operation.
		 * @param  {String} accountAddr account to get the maximum withdrawal amount
		 * @return {[Number]}      maximum withdrawal amount for accountAddr
		 */
		this.maxWithdrawAmount = async function (accountAddr) {
			let vaultBalance = await this.vaultBalance(accountAddr);
			let minted = await this.minted(accountAddr);

			let amount = vaultBalance - minted - this.minTransactionFee();
			if (amount < 0) {
				return 0;
			}

			// if the amount leaves less than minVaultBalance, leave minVaultBalance
			if (vaultBalance - amount - this.minTransactionFee() < this.minVaultBalance()) {
				amount = vaultBalance - this.minVaultBalance() - this.minTransactionFee();
			}
			if (amount < 0) {
				return 0;
			}

			return amount;
		};

		/**
		 * Get the maximum amount of wALGOs that accountAddr can mint.
		 * It calculates the amount, based on the minted wALGOs, Vault balance, mint fees,
		 * and the transaction fees to pay in the mintwALGOs operation.
		 * @param  {String} accountAddr account to get the maximum mint amount
		 * @return {[Number]}      maximum mint amount for accountAddr
		 */
		this.maxMintAmount = async function (accountAddr) {
			let vaultBalance = await this.vaultBalance(accountAddr);
			let minted = await this.minted(accountAddr);
			let fee = await this.mintFee();
			let maxAmount;

			if (fee !== 0) {
				// feesToPay = maxAmount*fee/10000
				// maxAmount = vaultBalance - minted - feesToPay - minFee
				// maxAmount = vaultBalance - minted - maxAmount*fee/10000 - minFee
				// maxAmount*(1+fee/10000) = vaultBalance - minted
				// maxAmount = (vaultBalance - minted - minFee) / (1+fee/10000)
				maxAmount = Math.floor((vaultBalance - minted - this.minTransactionFee()) / (1 + (fee / 10000)));
				if (maxAmount > 0) {
					// rounding error can generate an error above 1 so the real maxAmount is a bit higher
					while (vaultBalance - minted - maxAmount - Math.floor(maxAmount * fee / 10000) - this.minTransactionFee() >= 1) {
						maxAmount += 1;
					}
				}
			}
			else {
				maxAmount = vaultBalance - minted;
			}

			return (maxAmount > 0 ? maxAmount : 0);
		};

		/**
		 * Get the compiled Object of the vault teal code applied to accountAddr.
		 * @param  {String} accountAddr account to apply the vault teal template code
		 * @return {[Object]}      object which has {result: compiledTealCodeBase64, hash: addressOfVault }
		 */
		this.vaultCompiledTEALByAddress = function(accountAddr) {
			if (!vaultTEAL) {
				// eslint-disable-next-line security/detect-non-literal-fs-filename
				vaultTEAL = fs.readFileSync(vaultProgramFilename, 'utf8');
			}

			let program = vaultTEAL;

			// eslint-disable-next-line require-unicode-regexp
			program = program.replace(/TMPL_APP_ID/g, this.appId);
			// eslint-disable-next-line require-unicode-regexp
			program = program.replace(/TMPL_USER_ADDRESS/g, accountAddr);

			let encoder = new TextEncoder();
			let programBytes = encoder.encode(program);

			return this.algodClient.compile(programBytes).do();
		};

		/**
		 * Internal function.
		 * Sign transaction From a user Vault. It is signed using the teal code.
		 * @param  {String} sender owner of the Vault
		 * @param  {Object} tx transaction to sign
		 * @return {Object}      signed transaction
		 */
		this.signVaultTx = async function(sender, tx) {
			const compiledProgram = await this.vaultCompiledTEALByAddress(sender);

			let vaultProgram = new Uint8Array(Buffer.from(compiledProgram.result, "base64"));
			let lsigVault = algosdk.makeLogicSig(vaultProgram);
			let txSigned = algosdk.signLogicSigTransactionObject(tx, lsigVault);

			return txSigned;
		};

		/**
		 * Deposit algos from sender to sender's Vault.
		 * @param  {String} sender owner of the Vault
		 * @param  {Number} amount amount of algos to deposit
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @return {[String]}      transaction id of the transaction
		 */
		this.depositALGOs = async function (sender, amount, signCallback) {
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			let vaultAddr = await this.vaultAddressByApp(sender);
			if (!vaultAddr) {
				throw new Error('ERROR: Account not opted in');
			}

			// create unsigned transaction
			let txPayment = algosdk.makePaymentTxnWithSuggestedParams(sender, vaultAddr, amount, undefined, new Uint8Array(0), params);

			let signed = [];
			let txPaymentSigned = signCallback(sender, txPayment);
			signed.push(txPaymentSigned);

			let tx = (await this.algodClient.sendRawTransaction(signed).do());

			return tx.txId;
		};

		/**
		 * Mint wALGOs from sender's Vault and send them to sender.
		 * @param  {String} sender owner of the Vault
		 * @param  {Number} amount amount of wALGOs to mint
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @param  {Number} forceAppId force to use this one instead of the Vault. Used to test
		 * @param  {Number} forceAssetId force to use this one instead of wALGO. Used to test
		 * @param  {Number} forceFeeMintOperation force to use this one instead of wALGO. Used to test
		 * @return {[String]}      transaction id of one of the transactions in the transaction group
		 */
		this.mintwALGOs = async function (sender, amount, signCallback, forceAppId, forceAssetId, forceFeeMintOperation) {
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			let minterAddr = await this.mintAccount();
			let vaultAddr = await this.vaultAddressByApp(sender);
			let mintFee = await this.mintFee();

			if (!minterAddr) {
				throw new Error('ERROR: Mint account not defined');
			}
			if (!vaultAddr) {
				throw new Error('ERROR: Account not opted in');
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(MINT_WALGOS_OP)));

			let appAccounts = [];
			appAccounts.push(vaultAddr);

			let appplicationId = this.appId;
			let asaId = this.assetId;

			if (forceAppId) {
				appplicationId = forceAppId;
			}
			if (forceAssetId) {
				asaId = forceAssetId;
			}

			let txPayFees;

			// create unsigned transaction
			let txApp = algosdk.makeApplicationNoOpTxn(sender, params, appplicationId, appArgs, appAccounts);

			if (forceFeeMintOperation) {
				params.fee = forceFeeMintOperation;
			}

			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(
				minterAddr, sender, undefined, undefined, amount, new Uint8Array(0),
				asaId, params
			);
			let txns = [ txApp, txwALGOTransfer ];

			if (forceFeeMintOperation) {
				params.fee = this.minFee;
			}

			if (mintFee > 0) {
				let fees = Math.floor(mintFee * amount / 10000);
				txPayFees = algosdk.makePaymentTxnWithSuggestedParams(
					vaultAddr,
					this.adminAddr, fees, undefined, new Uint8Array(0), params
				);
				txns.push(txPayFees);
			}

			// Group both transactions
			algosdk.assignGroupID(txns);

			let signed = [];
			let txAppSigned = signCallback(sender, txApp);
			let txwALGOTransferSigned = algosdk.signLogicSigTransactionObject(txwALGOTransfer, this.lsigMint);

			signed.push(txAppSigned);
			signed.push(txwALGOTransferSigned.blob);

			if (txPayFees) {
				let txPayFeesSigned = await this.signVaultTx(sender, txPayFees);
				signed.push(txPayFeesSigned.blob);
			}

			let tx = (await this.algodClient.sendRawTransaction(signed).do());

			return tx.txId;
		};

		/**
		 * Withdraw algos from sender's Vault and send them to sender.
		 * @param  {String} sender owner of the Vault
		 * @param  {Number} amount amount of algos to withdraw
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @return {[String]}      transaction id of one of the transactions in the transaction group
		 */
		this.withdrawALGOs = async function (sender, amount, signCallback) {
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			let vaultAddr = await this.vaultAddressByApp(sender);
			if (!vaultAddr) {
				throw new Error('ERROR: Account not opted in');
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(WITHDRAW_ALGOS_OP)));

			let appAccounts = [];
			appAccounts.push(vaultAddr);

			// create unsigned transaction
			let txApp = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs, appAccounts);
			let txWithdraw = algosdk.makePaymentTxnWithSuggestedParams(vaultAddr, sender, amount, undefined, new Uint8Array(0), params);

			let txns = [ txApp, txWithdraw ];

			// Group both transactions
			algosdk.assignGroupID(txns);


			let signed = [];
			let txAppSigned = signCallback(sender, txApp);

			let txWithdrawSigned = await this.signVaultTx(sender, txWithdraw);

			signed.push(txAppSigned);
			signed.push(txWithdrawSigned.blob);

			let tx = (await this.algodClient.sendRawTransaction(signed).do());

			return tx.txId;
		};

		/**
		 * Burn wALGOs from sender.
		 * @param  {String} sender owner of the Vault that minted the wALGOs
		 * @param  {Number} amount amount of wALGOs to burn
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @param  {Number} forceAssetId force assetId to be the specified instead of wALGO. Used to test
		 * @return {[String]}      transaction id of one of the transactions in the transaction group
		 */
		this.burnwALGOs = async function (sender, amount, signCallback, forceAssetId) {
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			let minterAddr = await this.mintAccount();
			let vaultAddr = await this.vaultAddressByApp(sender);
			let asaId = this.assetId;
			let burnFee = await this.burnFee();

			if (forceAssetId) {
				asaId = forceAssetId;
			}

			if (!minterAddr) {
				throw new Error('ERROR: Mint account not defined');
			}
			if (!vaultAddr) {
				throw new Error('ERROR: Account not opted in');
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(BURN_ALGOS_OP)));

			let appAccounts = [];
			appAccounts.push(vaultAddr);

			let txPayFees;

			// create unsigned transaction
			let txApp = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs, appAccounts);
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(
				sender, minterAddr, undefined, undefined, amount, new Uint8Array(0),
				asaId, params
			);
			let txns = [ txApp, txwALGOTransfer ];

			if (burnFee > 0) {
				let fees = Math.floor(burnFee * amount / 10000);
				txPayFees = algosdk.makePaymentTxnWithSuggestedParams(
					vaultAddr,
					this.adminAddr, fees, undefined, new Uint8Array(0), params
				);
				txns.push(txPayFees);
			}

			// Group both transactions
			algosdk.assignGroupID(txns);

			let signed = [];
			let txAppSigned = signCallback(sender, txApp);
			let txwALGOTransferSigned = signCallback(sender, txwALGOTransfer);
			signed.push(txAppSigned);
			signed.push(txwALGOTransferSigned);

			if (txPayFees) {
				let txPayFeesSigned = await this.signVaultTx(sender, txPayFees);
				signed.push(txPayFeesSigned.blob);
			}

			let tx = (await this.algodClient.sendRawTransaction(signed).do());

			return tx.txId;
		};

		/**
		 * Internal function.
		 * Try to burn the algos from the Minter account instead of the user trying to bypass controls. Audit report.
		 * @param  {String} sender owner of the Vault that minted the wALGOs
		 * @param  {Number} amount amount of wALGOs to burn
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @param  {Number} forceAssetId force assetId to be the specified instead of wALGO. Used to test
		 * @return {[String]}      transaction id of one of the transactions in the transaction group
		 */
		this.burnwALGOsAttack = async function (sender, amount, signCallback, forceAssetId) {
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			let minterAddr = await this.mintAccount();
			let vaultAddr = await this.vaultAddressByApp(sender);
			let asaId = this.assetId;
			let burnFee = await this.burnFee();

			if (forceAssetId) {
				asaId = forceAssetId;
			}

			if (!minterAddr) {
				throw new Error('ERROR: Mint account not defined');
			}
			if (!vaultAddr) {
				throw new Error('ERROR: Account not opted in');
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(BURN_ALGOS_OP)));

			let appAccounts = [];
			appAccounts.push(vaultAddr);

			let txPayFees;

			// create unsigned transaction
			let txApp = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs, appAccounts);
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(
				minterAddr, minterAddr, undefined, undefined, amount, new Uint8Array(0),
				asaId, params
			);
			let txns = [ txApp, txwALGOTransfer ];

			if (burnFee > 0) {
				let fees = Math.floor(burnFee * amount / 10000);
				txPayFees = algosdk.makePaymentTxnWithSuggestedParams(
					vaultAddr,
					this.adminAddr, fees, undefined, new Uint8Array(0), params
				);
				txns.push(txPayFees);
			}

			// Group both transactions
			algosdk.assignGroupID(txns);

			let signed = [];
			let txAppSigned = signCallback(sender, txApp);
			let txwALGOTransferSigned = algosdk.signLogicSigTransactionObject(txwALGOTransfer, this.lsigMint);
			signed.push(txAppSigned);
			signed.push(txwALGOTransferSigned.blob);

			if (txPayFees) {
				let txPayFeesSigned = await this.signVaultTx(sender, txPayFees);
				signed.push(txPayFeesSigned.blob);
			}

			let tx = (await this.algodClient.sendRawTransaction(signed).do());

			return tx.txId;
		};

		/**
		 * CloseOut sender and withdraw all the remaining algos. To call this function, sender must burn all minted wALGOs.
		 * @param  {String} sender owner of the Vault
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @param  {String} forceTo force To address instead of sender. Used to test
		 * @param  {Number} forceToAmount force the withdrawal this amount instead of calculating it automatically. Used to test
		 * @param  {String} forceClose force Close address instead of the vault admin. Used to test
		 * @return {[String]}      transaction id of one of the transactions in the transaction group
		 */
		this.closeOut = async function (sender, signCallback, forceTo, forceToAmount, forceClose) {
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			let vaultAddr = await this.vaultAddressByApp(sender);
			if (!vaultAddr) {
				throw new Error('ERROR: Account not opted in');
			}

			let toAmount = 0;
			let vaultBalance = await this.vaultBalance(sender);

			// if there is no balance just ClearApp
			if (vaultBalance === 0) {
				return (this.clearApp(sender, signCallback));
			}

			if (forceToAmount) {
				toAmount = forceToAmount;
			}

			let toAddr = sender;
			let closeAddr = sender;

			if (forceTo) {
				toAddr = forceTo;
			}
			if (forceClose) {
				closeAddr = forceClose;
			}

			let appAccounts = [];
			appAccounts.push(vaultAddr);

			// create unsigned transaction
			const txApp = algosdk.makeApplicationCloseOutTxn(sender, params, this.appId, undefined, appAccounts);
			let txWithdraw = algosdk.makePaymentTxnWithSuggestedParams(
				vaultAddr, toAddr, toAmount, closeAddr,
				new Uint8Array(0), params
			);

			let txns = [ txApp, txWithdraw ];

			// Group both transactions
			algosdk.assignGroupID(txns);

			let signed = [];
			let txAppSigned = signCallback(sender, txApp);
			let txWithdrawSigned = await this.signVaultTx(sender, txWithdraw);

			signed.push(txAppSigned);
			signed.push(txWithdrawSigned.blob);

			let tx = (await this.algodClient.sendRawTransaction(signed).do());

			return tx.txId;
		};

		/**
		 * Internal function.
		 * Call application specifying args and accounts.
		 * @param  {String} sender caller address
		 * @param  {Array} appArgs array of arguments to pass to application call
		 * @param  {Array} appAccounts array of accounts to pass to application call
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions.
		 * If not specified, it returns a transaction object
		 * @return {[String]}      transaction id of the created application or a transaction object if signCallback is not specified
		 */
		this.callApp = async function (sender, appArgs, appAccounts, signCallback) {
			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			// create unsigned transaction
			const txApp = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs, appAccounts);
			const txId = txApp.txID().toString();

			if (!signCallback) {
				return txApp;
			}

			// Sign the transaction
			let txAppSigned = signCallback(sender, txApp);

			// Submit the transaction
			await this.algodClient.sendRawTransaction(txAppSigned).do();

			return txId;
		};

		/**
		 * Internal function.
		 * Try to send 2 txs in a group to withdraw algos from a Vault using admin account.
		 * @param  {String} sender admin account
		 * @param  {String} mintAddr new minter account
		 * @param  {String} accountAddr Vault owner to drain algos
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @return {String}      transaction id of the transaction
		 */
		this.setMintAccountAttack = function (sender, mintAddr, accountAddr, signCallback) {
			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(SET_MINT_ACCOUNT_OP)));
			let appAccounts = [];
			appAccounts.push(mintAddr);

			return this.testCallAppAttack(sender, appArgs, appAccounts, accountAddr, signCallback);
		};

		/**
		 * Internal function.
		 * Simulate a mintwALGOs operation and update the code. Audit Report.
		 * @param  {String} sender normal account, must be opted in
		 * @param  {Number} amount amount to mint
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @return {[String]}      transaction id of one of the transactions of the group
		 */
		this.updateAppAttack = async function (sender, amount, signCallback) {
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			let minterAddr = await this.mintAccount();
			let vaultAddr = await this.vaultAddressByApp(sender);
			let mintFee = await this.mintFee();

			if (!minterAddr) {
				throw new Error('ERROR: Mint account not defined');
			}
			if (!vaultAddr) {
				throw new Error('ERROR: Account not opted in');
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(MINT_WALGOS_OP)));

			let appAccounts = [];
			appAccounts.push(vaultAddr);

			let asaId = this.assetId;

			let txPayFees;

			let approvalProgramCompiled = await this.compileApprovalProgram();
			let clearProgramCompiled = await this.compileClearProgram();

			// create unsigned transaction
			const txApp = algosdk.makeApplicationUpdateTxn(
				sender,
				params, this.appId, approvalProgramCompiled, clearProgramCompiled, appArgs, appAccounts
			);
			let txwALGOTransfer = algosdk.makeAssetTransferTxnWithSuggestedParams(
				minterAddr, sender, undefined, undefined, amount, new Uint8Array(0),
				asaId, params
			);
			let txns = [ txApp, txwALGOTransfer ];

			if (mintFee > 0) {
				let fees = Math.floor(mintFee * amount / 10000);
				txPayFees = algosdk.makePaymentTxnWithSuggestedParams(
					vaultAddr, this.adminAddr, fees, undefined, new Uint8Array(0),
					params
				);
				txns.push(txPayFees);
			}

			// Group both transactions
			algosdk.assignGroupID(txns);

			let signed = [];
			let txAppSigned = signCallback(sender, txApp);
			let txwALGOTransferSigned = algosdk.signLogicSigTransactionObject(txwALGOTransfer, this.lsigMint);

			signed.push(txAppSigned);
			signed.push(txwALGOTransferSigned.blob);

			if (txPayFees) {
				let txPayFeesSigned = await this.signVaultTx(sender, txPayFees);
				signed.push(txPayFeesSigned.blob);
			}

			let tx = (await this.algodClient.sendRawTransaction(signed).do());

			return tx.txId;
		};

		/**
		 * Internal function.
		 * Create a clearState transaction from the vault to bypass vault.teal controls and withdraw algos from the vault. Audit report.
		 * @param  {String} sender normal account, must be opted in
		 * @param  {String} vaultOwnerAddr account to attack, must be opted in and have algos withdraw
		 * @param  {Number} amount amount of algos to withdraw
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @return {[String]}      transaction id of one of the transactions of the group
		 */
		this.clearStateAttack = async function (sender, vaultOwnerAddr, amount, signCallback) {
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			let vaultAddr = await this.vaultAddressByApp(vaultOwnerAddr);
			if (!vaultAddr) {
				throw new Error('ERROR: Account not opted in');
			}

			let appArgs = [];
			appArgs.push(new Uint8Array(Buffer.from(WITHDRAW_ALGOS_OP)));

			let appAccounts = [];
			appAccounts.push(vaultAddr);

			// create unsigned transaction
			let txApp = algosdk.makeApplicationClearStateTxn(sender, params, this.appId, appArgs, appAccounts);
			let txWithdraw = algosdk.makePaymentTxnWithSuggestedParams(vaultAddr, sender, amount, undefined, new Uint8Array(0), params);

			let txns = [ txApp, txWithdraw ];

			// Group both transactions
			algosdk.assignGroupID(txns);


			let signed = [];
			let txAppSigned = signCallback(sender, txApp);

			let txWithdrawSigned = await this.signVaultTx(vaultOwnerAddr, txWithdraw);

			signed.push(txAppSigned);
			signed.push(txWithdrawSigned.blob);

			let tx = (await this.algodClient.sendRawTransaction(signed).do());

			return tx.txId;
		};

		/**
		 * Internal function.
		 * Attach an additional transaction to the App Call to try to withdraw algos from a Vault.
		 * If the TEAL code does not verify the GroupSize correctly the Vault teal will approve the tx.
		 * @param  {String} sender normal account, must be opted in
		 * @param  {Array} appArgs array of arguments to pass to application call
		 * @param  {Array} appAccounts array of accounts to pass to application call
		 * @param  {String} attackAccountAddr account where the algos
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @return {[String]}      transaction id of one of the transactions of the group
		 */
		this.testCallAppAttack = async function (sender, appArgs, appAccounts, attackAccountAddr, signCallback) {
			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			let vaultAddr = await this.vaultAddressByApp(attackAccountAddr);
			if (!vaultAddr) {
				throw new Error('ERROR: Account not opted in');
			}

			// create unsigned transaction
			const txApp = algosdk.makeApplicationNoOpTxn(sender, params, this.appId, appArgs, appAccounts);
			let txWithdraw = algosdk.makePaymentTxnWithSuggestedParams(vaultAddr, sender, 10000, undefined, new Uint8Array(0), params);
			let txns = [ txApp, txWithdraw ];

			// Group both transactions
			algosdk.assignGroupID(txns);

			const compiledProgram = await this.vaultCompiledTEALByAddress(attackAccountAddr);

			let vaultProgram = new Uint8Array(Buffer.from(compiledProgram.result, "base64"));

			let lsigVault = algosdk.makeLogicSig(vaultProgram);

			let signed = [];
			let txAppSigned = signCallback(sender, txApp);
			let txWithdrawSigned = algosdk.signLogicSigTransactionObject(txWithdraw, lsigVault);
			signed.push(txAppSigned);
			signed.push(txWithdrawSigned.blob);

			let tx = (await this.algodClient.sendRawTransaction(signed).do());

			return tx.txId;
		};

		/**
		 * ClearState sender. Remove all the sender associated local data.
		 * NOTE: if there is any balance in the Vault, it will be lost forever.
		 * @param  {String} sender account to ClearState
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @return {[String]}      transaction id of one of the transactions of the group
		 */
		this.clearApp = async function (sender, signCallback) {
			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			// create unsigned transaction
			const txApp = algosdk.makeApplicationClearStateTxn(sender, params, this.appId);
			const txId = txApp.txID().toString();

			// Sign the transaction
			let txAppSigned = signCallback(sender, txApp);

			// Submit the transaction
			await this.algodClient.sendRawTransaction(txAppSigned).do();

			return txId;
		};

		/**
		 * Update app code using default filenames.
		 * @param  {String} sender admin account used to update the application code
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @return {String}      transaction id of one of the transactions of the group
		 */
		this.updateApp = async function (sender, signCallback) {
			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			let approvalProgramCompiled = await this.compileApprovalProgram();
			let clearProgramCompiled = await this.compileClearProgram();

			// create unsigned transaction
			const txApp = algosdk.makeApplicationUpdateTxn(sender, params, this.appId, approvalProgramCompiled, clearProgramCompiled);
			const txId = txApp.txID().toString();

			// Sign the transaction
			let txAppSigned = signCallback(sender, txApp);

			// Submit the transaction
			await this.algodClient.sendRawTransaction(txAppSigned).do();

			return txId;
		};

		/**
		 * Permanent delete the application.
		 * @param  {String} sender admin account
		 * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
		 * @param {Number} applicationId force this application id
		 * @return {String}      transaction id of one of the transactions of the group
		 */
		this.deleteApp = async function (sender, signCallback, applicationId) {
			// get node suggested parameters
			const params = await this.algodClient.getTransactionParams().do();

			params.fee = this.minFee;
			params.flatFee = true;

			if (!applicationId) {
				applicationId = this.appId;
			}
			// create unsigned transaction
			const txApp = algosdk.makeApplicationDeleteTxn(sender, params, applicationId);
			const txId = txApp.txID().toString();

			// Sign the transaction
			let txAppSigned = signCallback(sender, txApp);

			// Submit the transaction
			await this.algodClient.sendRawTransaction(txAppSigned).do();

			return txId;
		};

	}
}

module.exports = {
	VaultManager
};

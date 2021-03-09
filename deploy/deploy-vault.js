const fs = require('fs');
const algosdk = require('algosdk');
const vault = require('../vault');
const asaTools = require('../asa-tools');
const msgpack = require("msgpack-lite");
const readline = require('readline');
const transaction = require('algosdk/src/transaction');
const encoding = require('algosdk/src/encoding/encoding');

function usage() {
	console.log('Usage: node deploy-vault.js\n\n' +
		'Admin Commands:\n' +
		'\t\tcreate-walgo supply decimals\n' +
		'\t\t\tCreate wALGO token, the --from (or multisig) is used as reserve and manager\n' +
		'\t\tdelete-asset asa-id\n' +
		'\t\t\tDelete asset asa-id, --from must be the owner\n' +
		'\t\tcreate-app asa-id\n' +
		'\t\tdelete-app app-id\n\t\t\tDelete application. --from must be the Admin.\n' +
		'\t\tinit-app wALGO-id app-id. --from must be the Admin.\n' +
		'\t\tupdate-app app-id. --from must be the Admin.\n' +
		'\t\tdelegate-minter wALGO-id app-id\n' +
		'\t\tset-minter app-id minter-address. --from must be the Admin.\n' +
		'\t\tset-mint-fee app-id 0-5000 (0%-50%). --from must be the Admin.\n' +
		'\t\tset-burn-fee app-id 0-5000 (0%-50%). --from must be the Admin.\n' +
		'\t\tset-creation-fee app-id fee-microALGOs. --from must be the Admin.\n' +
		'\t\tset-minter app-id minter-address. --from must be the Admin.\n' +
		'\t\tset-global-status app-id 0|1\n\t\t\tSet app global status: 0 (disabled) or 1 (enabled). --from must be the Admin.\n' +
		'\t\tget-global-status app-id creator-addr\n\t\t\tGet app global status: 0 (disabled) or 1 (enabled).\n' +
		'\t\tset-account-status app-id account-address 0|1\n\t\t\tSet account status: 0 (disabled) or 1 (enabled). ' +
		'--from must be the Admin.\n' +
		'\t\tget-account-status app-id creator-addr account-address\n\t\t\tGet account status: 0 (disabled) or 1 (enabled). \n' +
		'\t\tget-mint-fee app-id creator-addr\n\t\t\tGet mint fee: 0-5000 (0%-50%).\n' +
		'\t\tget-burn-fee app-id creator-addr\n\t\t\tGet burn fee: 0-5000 (0%-50%).\n' +
		'\t\tget-creation-fee app-id creator-addr\n\t\t\tGet creation fee in microALGOs.\n' +
		'\t\tget-admin app-id creator-addr\n\t\t\tGet Admin account.\n' +
		'\t\tget-minter app-id creator-addr\n\t\t\tGet Minter account.\n' +
		'\t\tget-walgo-id app-id creator-addr\n\t\t\tGet wALGO ASA id.\n' +
		'User Commands:\n\n' +
		'\t\toptin app-id creator-addr\n' +
		'\t\toptin-asa asa-id\n' +
		'\t\tcloseout-asa asa-id close-addr. close-addr must be opted in to asa-id\n' +
		'\t\ttransfer-asa asa-id target-addr. target-addr must be opted in to asa-id\n' +
		'\t\tcloseout app-id creator-addr\n' +
		'\t\tdeposit app-id creator-addr amount-microALGOs\n' +
		'\t\twithdraw app-id creator-addr amount-microALGOs\n' +
		'\t\tmint app-id creator-addr amount-wALGOs delegation-filepath\n' +
		'\t\tburn app-id creator-addr amount-wALGOs\n' +
		'\t\tget-minted app-id. --from must be the User Account and has to be opted in.\n' +
		'\t\tget-vault-addr app-id. --from must be the User Account and has to be opted in.\n' +
		'\t\tget-vault-balance app-id. --from must be the User Account and has to be opted in.\n' +
		'\t\tget-max-mint app-id. --from must be the User Account and has to be opted in.\n\t\t\tGet the maximum amount ' +
		'that the account can mint.\n' +
		'\t\tget-max-withdraw app-id. --from must be the User Account and has to be opted in.\n\t\t\tGet the maximum amount ' +
		'that the account can withdraw.\n' +
		'Multisig Commands:\n\n' +
		'\t\tget-multisig-addr\n\t\t\tUse multiple --from and --threshold to define the multisig to get the address\n' +
		'Modifiers:\n' +
		'\t\t--from account-address\n\t\t\tUse --from to set the transaction sender or use it multiple times to setup\n' +
		'\t\t\ta multisig account combined with --threshold\n' +
		'\t\t--in filein\n\t\t\tLoad transactions from file. Useful to sign and send transactions previously generated\n' +
		'\t\t--out fileout\n\t\t\tGenerate the transactions and dump them to a file\n' +
		'\t\t--first-round first-round\n\t\t\tEspecify when the transaction starts to be valid. By default, current round\n' +
		'\t\t--private-key\n\t\t\tUse this private key to sign transactions. Remomended only for test purposes.\n' +
		'\t\t--print\n\t\t\tPrint transactions before signing\n' +
		'\t\t--threshold\n\t\t\tIf there is more than one --from it sets the to set the multisig threshold\n' +
		'\t\t--net mainnet|testnet|betanet (default: testnet)\n' +
		'\t\t--sign\n\t\t\tSign transactions created or loaded from file\n' +
		'\t\t--send\n\t\t\tSend signed transaction/s from file\n');

	process.exit(0);
}

function readLineAsync() {
	const rl = readline.createInterface({
		input: process.stdin
	});
	return new Promise((resolve) => {
		rl.prompt();
		rl.on('line', (line) => {
			rl.close();
			resolve(line);
		});
	});
}

function signCount(tx) {
	let count = 0;
	if (!tx.msig) {
		return count;
	}
	for (let i = 0; i < tx.msig.subsig.length; i++) {
		if (tx.msig.subsig[i].s) {
			count += 1;
		}
	}
	return count;
}

let signatures = {};
let printTxs;
let privateKey;

async function signCallback(sender, tx, mparams) {
	let key;

	let txObj = tx;
	if (!tx.get_obj_for_encoding) {
		txObj = encoding.decode(tx);
	}

	if (!signatures[sender]) {
		if (printTxs) {
			console.log('Transaction to sign: \n %s', JSON.stringify(txObj));
		}
		if (!privateKey) {
			if (mparams) {
				console.log('\nEnter mnemonic for multisig %s:', sender);
			}
			else {
				console.log('\nEnter mnemonic for %s:', sender);
			}
			const line = await readLineAsync();
			key = algosdk.mnemonicToSecretKey(line);
		}
		else {
			key = privateKey;
		}

		// eslint-disable-next-line require-atomic-updates
		signatures[sender] = key;
	}
	else {
		key = signatures[sender];
	}

	if (!mparams) {
		if (key.addr !== sender) {
			console.error('Key does not match the sender %s', sender);
			process.exit(1);
		}

		const txSigned = tx.signTxn(key.sk);
		return txSigned;
	}
	if (!txObj.msig) {
		const txSigned = algosdk.signMultisigTransaction(tx, mparams, key.sk).blob;
		return txSigned;
	}

	let count = signCount(txObj);
	const txSigned = algosdk.appendSignMultisigTransaction(tx, mparams, key.sk).blob;
	txObj = encoding.decode(txSigned);
	if (count === signCount(txObj)) {
		console.error('\nSignature of %s is present\n', key.addr);
		process.exit(0);
	}
	return txSigned;
}

async function lsigCallback(sender, lsig, mparams) {
	let key;

	if (!signatures[sender]) {
		if (!privateKey) {
			if (mparams) {
				console.log('\nEnter mnemonic for multisig %s:', sender);
			}
			else {
				console.log('\nEnter mnemonic for %s:', sender);
			}
			const line = await readLineAsync();
			key = algosdk.mnemonicToSecretKey(line);
		}
		else {
			key = privateKey;
		}

		if (!mparams && key.addr !== sender) {
			console.error('Key does not match the sender %s', sender);
			process.exit(1);
		}
		// eslint-disable-next-line require-atomic-updates
		signatures[sender] = key;
	}
	else {
		key = signatures[sender];
	}

	if (!mparams) {
		if (key.addr !== sender) {
			console.error('Key does not match the sender %s', sender);
			process.exit(1);
		}

		lsig.sign(signatures[sender].sk);
		return;
	}
	let count = signCount(lsig);
	if (count === 0) {
		lsig.sign(key.sk, mparams);
	}
	else {
		lsig.appendToMultisig(key.sk);
	}
	if (count === signCount(lsig)) {
		console.error('\nSignature of %s is present\n', key.addr);
		process.exit(0);
	}
}

async function loadTransactionsFromFile(filename) {
	let txs = [];

	if (typeof filename !== 'string' || filename.length == 0) {
		throw new Error("Invalid filename");
	}

	//create decoder stream
	let decodeStream = msgpack.createDecodeStream();
	decodeStream.on("data", (_tx) => {
		if (_tx.gen) {
			txs.push(transaction.Transaction.from_obj_for_encoding(_tx));
		}
		else {
			let txBlob = new Uint8Array(Buffer.from(_tx, "base64"));
			txs.push(txBlob);
		}
	});

	//NOTE: The decoder does not accept partial reads
	// eslint-disable-next-line security/detect-non-literal-fs-filename
	let buffer = fs.readFileSync(filename);
	decodeStream.write(buffer);
	decodeStream.end();

	await new Promise((resolve, reject) => {
		decodeStream.once('end', () => {
			resolve(txs);
		}).once('error', reject);
	});

	return txs;
}

/**
 * Save transactions to a file
 *
 * @param {Array} txs of Algorand Transaction Objects
 * @param {String} filename Filename of txs
 * @return {Void} void
 */
async function saveTransactionsToFile(txs, filename) {
	if (typeof filename !== 'string' || filename.length == 0) {
		console.error("Invalid filename");
		usage();
	}
	if (!Array.isArray(txs)) {
		console.error("Invalid transactions");
		usage();
	}

	// eslint-disable-next-line security/detect-non-literal-fs-filename
	let outputStream = fs.createWriteStream(filename);
	let outputEncoderStream = msgpack.createEncodeStream({
		codec: msgpack.createCodec({ //to match algosdk encoding options
			canonical: true
		})
	});
	outputEncoderStream.pipe(outputStream);

	for (let _tx of txs) {
		if (_tx.get_obj_for_encoding) {
			outputEncoderStream.write(_tx.get_obj_for_encoding());
		}
		else {
			let txb64 = Buffer.from(_tx).toString('base64');
			outputEncoderStream.write(txb64);
		}
	}
	outputEncoderStream.end();

	await new Promise((resolve, reject) => {
		outputStream.once('finish', () => {
			resolve();
		}).once('error', reject);
	});
}

function getAddress(arg) {
	if (arg.length != 58) {
		console.log('Invalid address %s\n', arg);
		usage();
	}
	return arg;
}

function getInteger(amount) {
	if (Number.isInteger(amount) || amount < 0) {
		console.log('Invalid Amount: %s', amount);
		usage();
	}
	amount = parseInt(amount, 10);
	return amount;
}

async function deployVaultApp() {
	let filein;
	let fileout;
	let from;
	let multisig;
	let mparams;
	let assetId;
	let threshold;
	let sendTxs;
	let signTxs;
	let createApp;
	let createTxs;
	let deleteApp;
	let createwALGO;
	let deleteAsset;
	let getGlobalStatus;
	let getAccountStatus;
	let getAdmin;
	let getMinter;
	let getwALGOId;
	let getMintFee;
	let getBurnFee;
	let getCreationFee;
	let getMulsigAddr;
	let initApp;
	let appId;
	let delegateMinter;
	let setMinter;
	let setGlobalStatus;
	let setAccountStatus;
	let setMintFee;
	let setBurnFee;
	let setCreationFee;
	let newFee;
	let accountAddr;
	let newStatus;
	let minterAddr;
	let optin;
	let closeout;
	let mint;
	let burn;
	let withdraw;
	let deposit;
	let optinAsa;
	let getMaxMint;
	let getMaxWithdraw;
	let getMinted;
	let getVaultAddr;
	let getVaultBalance;
	let closeoutAsa;
	let transferAsa;
	let targetAddr;
	let creatorAddr;
	let wALGOs;
	let delegationFilepath;
	let algos;

	let network = 'testnet';
	let supply;
	let decimals;
	let firstRound;
	let txs = [];

	if (process.argv.length === 2) {
		usage();
	}

	try {
		// get general configurations
		for (let idx = 2; idx < process.argv.length; idx++) {
			if (process.argv[idx] == 'create-app') {
				createApp = true;
			}
			else if (process.argv[idx] == 'delete-app') {
				deleteApp = true;
				idx += 1;
				// get asa-id
				appId = getInteger(process.argv[idx]);
			}
			else if (process.argv[idx] == 'init-app') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get asa-id
				assetId = getInteger(process.argv[idx]);
				idx += 1;
				// get app-id
				appId = getInteger(process.argv[idx]);
				initApp = true;
			}
			else if (process.argv[idx] == 'set-minter') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get app-id
				appId = getInteger(process.argv[idx]);
				// get minter-address
				idx += 1;
				minterAddr = getAddress(process.argv[idx]);
				setMinter = true;
			}
			else if (process.argv[idx] == 'set-global-status') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get app-id
				appId = getInteger(process.argv[idx]);
				// get status
				idx += 1;
				newStatus = getInteger(process.argv[idx]);
				if (newStatus !== 0 && newStatus !== 1) {
					console.log('New status must be 0 or 1.');
					usage();
				}
				setGlobalStatus = true;
			}
			else if (process.argv[idx] == 'set-account-status') {
				if (idx + 3 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get app-id
				appId = getInteger(process.argv[idx]);
				idx += 1;
				// get account-addr
				accountAddr = getAddress(process.argv[idx]);
				// get status
				idx += 1;
				newStatus = getInteger(process.argv[idx]);
				if (newStatus !== 0 && newStatus !== 1) {
					console.log('New status must be 0 or 1.');
					usage();
				}
				setAccountStatus = true;
			}
			else if (process.argv[idx] == 'set-mint-fee') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get app-id
				appId = getInteger(process.argv[idx]);
				// get fee
				idx += 1;
				newFee = getInteger(process.argv[idx]);
				if (newFee < 0 || newFee > 5000) {
					console.log('New fee must be between 0 and 5000 (0-50%).');
					usage();
				}
				setMintFee = true;
			}
			else if (process.argv[idx] == 'set-burn-fee') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get app-id
				appId = getInteger(process.argv[idx]);
				// get fee
				idx += 1;
				newFee = getInteger(process.argv[idx]);
				if (newFee < 0 || newFee > 5000) {
					console.log('New fee must be between 0 and 5000 (0-50%).');
					usage();
				}
				setBurnFee = true;
			}
			else if (process.argv[idx] == 'set-creation-fee') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get app-id
				appId = getInteger(process.argv[idx]);
				// get fee
				idx += 1;
				newFee = getInteger(process.argv[idx]);
				if (newFee < 0) {
					console.log('New fee must be greater than 0.');
					usage();
				}
				setCreationFee = true;
			}
			else if (process.argv[idx] == 'optin') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get app-id
				appId = getInteger(process.argv[idx]);
				idx += 1;
				creatorAddr = getAddress(process.argv[idx]);
				optin = true;
			}
			else if (process.argv[idx] == 'closeout') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get app-id
				appId = getInteger(process.argv[idx]);
				idx += 1;
				creatorAddr = getAddress(process.argv[idx]);
				closeout = true;
			}
			else if (process.argv[idx] == 'optin-asa') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get asa-id
				assetId = getInteger(process.argv[idx]);
				optinAsa = true;
			}
			else if (process.argv[idx] == 'closeout-asa') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get asa-id
				assetId = getInteger(process.argv[idx]);
				idx += 1;
				// get target address
				targetAddr = getAddress(process.argv[idx]);
				closeoutAsa = true;
			}
			else if (process.argv[idx] == 'transfer-asa') {
				if (idx + 3 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get asa-id
				assetId = getInteger(process.argv[idx]);
				idx += 1;
				// get target address
				targetAddr = getAddress(process.argv[idx]);
				idx += 1;
				// get amount
				wALGOs = getInteger(process.argv[idx]);
				transferAsa = true;
			}
			else if (process.argv[idx] == 'mint') {
				if (idx + 3 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get app-id
				appId = getInteger(process.argv[idx]);
				idx += 1;
				creatorAddr = getAddress(process.argv[idx]);
				idx += 1;
				// get amount-walgos
				if (process.argv[idx] === 'max') {
					wALGOs = -1;
				}
				else {
					wALGOs = getInteger(process.argv[idx]);
				}
				idx += 1;
				delegationFilepath = process.argv[idx];
				mint = true;
			}
			else if (process.argv[idx] == 'burn') {
				if (idx + 3 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get app-id
				appId = getInteger(process.argv[idx]);
				idx += 1;
				creatorAddr = getAddress(process.argv[idx]);
				idx += 1;
				// get amount-walgos
				if (process.argv[idx] === 'max') {
					wALGOs = -1;
				}
				else {
					wALGOs = getInteger(process.argv[idx]);
				}
				burn = true;
			}
			else if (process.argv[idx] == 'deposit') {
				if (idx + 3 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get app-id
				appId = getInteger(process.argv[idx]);
				idx += 1;
				creatorAddr = getAddress(process.argv[idx]);
				idx += 1;
				// get amount-algos
				algos = getInteger(process.argv[idx]);
				deposit = true;
			}
			else if (process.argv[idx] == 'withdraw') {
				if (idx + 3 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get app-id
				appId = getInteger(process.argv[idx]);
				idx += 1;
				creatorAddr = getAddress(process.argv[idx]);
				idx += 1;
				// get amount-algos
				if (process.argv[idx] === 'max') {
					algos = -1;
				}
				else {
					algos = getInteger(process.argv[idx]);
				}
				withdraw = true;
			}
			else if (process.argv[idx] == 'delegate-minter') {
				if (idx + 3 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get asa-id
				assetId = getInteger(process.argv[idx]);
				idx += 1;
				// get app-id
				appId = getInteger(process.argv[idx]);
				delegateMinter = true;
			}
			else if (process.argv[idx] == 'create-walgo') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				supply = getInteger(process.argv[idx]);
				idx += 1;
				decimals = getInteger(process.argv[idx]);
				createwALGO = true;
			}
			else if (process.argv[idx] == 'delete-asset') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				// get asa-id
				assetId = getInteger(process.argv[idx]);
				deleteAsset = true;
			}
			else if (process.argv[idx] == 'get-global-status') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				appId = getInteger(process.argv[idx]);
				idx += 1;
				creatorAddr = getAddress(process.argv[idx]);
				getGlobalStatus = true;
			}
			else if (process.argv[idx] == 'get-account-status') {
				if (idx + 3 >= process.argv.length) {
					usage();
				}

				idx += 1;
				appId = getInteger(process.argv[idx]);
				idx += 1;
				creatorAddr = getAddress(process.argv[idx]);
				idx += 1;
				// get target address
				targetAddr = getAddress(process.argv[idx]);
				getAccountStatus = true;
			}
			else if (process.argv[idx] == 'get-admin') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				appId = getInteger(process.argv[idx]);
				idx += 1;
				creatorAddr = getAddress(process.argv[idx]);
				getAdmin = true;
			}
			else if (process.argv[idx] == 'get-minter') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				appId = getInteger(process.argv[idx]);
				idx += 1;
				creatorAddr = getAddress(process.argv[idx]);
				getMinter = true;
			}
			else if (process.argv[idx] == 'get-walgo-id') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				appId = getInteger(process.argv[idx]);
				idx += 1;
				creatorAddr = getAddress(process.argv[idx]);
				getwALGOId = true;
			}
			else if (process.argv[idx] == 'get-mint-fee') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				appId = getInteger(process.argv[idx]);
				idx += 1;
				creatorAddr = getAddress(process.argv[idx]);
				getMintFee = true;
			}
			else if (process.argv[idx] == 'get-burn-fee') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				appId = getInteger(process.argv[idx]);
				idx += 1;
				creatorAddr = getAddress(process.argv[idx]);
				getBurnFee = true;
			}
			else if (process.argv[idx] == 'get-creation-fee') {
				if (idx + 2 >= process.argv.length) {
					usage();
				}

				idx += 1;
				appId = getInteger(process.argv[idx]);
				idx += 1;
				creatorAddr = getAddress(process.argv[idx]);
				getCreationFee = true;
			}
			else if (process.argv[idx] == 'get-multisig-addr') {
				getMulsigAddr = true;
			}
			else if (process.argv[idx] == 'get-minted') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				appId = getInteger(process.argv[idx]);
				getMinted = true;
			}
			else if (process.argv[idx] == 'get-max-mint') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				appId = getInteger(process.argv[idx]);
				getMaxMint = true;
			}
			else if (process.argv[idx] == 'get-max-withdraw') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				appId = getInteger(process.argv[idx]);
				getMaxWithdraw = true;
			}
			else if (process.argv[idx] == 'get-vault-addr') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				appId = getInteger(process.argv[idx]);
				getVaultAddr = true;
			}
			else if (process.argv[idx] == 'get-vault-balance') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				appId = getInteger(process.argv[idx]);
				getVaultBalance = true;
			}
			else if (process.argv[idx] == '--in') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				filein = process.argv[idx];
			}
			else if (process.argv[idx] == '--out') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				fileout = process.argv[idx];
			}
			else if (process.argv[idx] == '--net') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				network = process.argv[idx];
				if (network !== 'mainnet' && network !== 'testnet' && network !== 'betanet') {
					console.log('Network must be mainnet, testnet or betanet');
					usage();
				}
			}
			else if (process.argv[idx] == '--from') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;

				if (!multisig) {
					if (from) {
						multisig = [ from ];
						from = undefined;
					}
					else {
						from = getAddress(process.argv[idx]);
					}
				}
				if (multisig) {
					multisig.push(getAddress(process.argv[idx]));
				}
			}
			else if (process.argv[idx] == '--threshold') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				threshold = getInteger(process.argv[idx]);
			}
			else if (process.argv[idx] == '--send') {
				sendTxs = true;
			}
			else if (process.argv[idx] == '--sign') {
				signTxs = true;
			}
			else if (process.argv[idx] == '--print') {
				printTxs = true;
			}
			else if (process.argv[idx] == '--private-key') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				privateKey = process.argv[idx];
				if (privateKey.indexOf('\'') >= 0 || privateKey.indexOf('"') >= 0) {
					privateKey = privateKey.substring(1, privateKey.length - 1);
				}
				console.log(privateKey);
				privateKey = algosdk.mnemonicToSecretKey(privateKey);
			}
			else if (process.argv[idx] == '--first-round') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				firstRound = process.argv[idx];
			}
			else {
				console.log('Unknown command: %s', process.argv[idx]);
				usage();
			}
		}

		let algodClient;
		if (network === 'mainnet') {
			algodClient = new algosdk.Algodv2("", "https://api.algoexplorer.io", "");
		}
		else if (network === 'testnet') {
			algodClient = new algosdk.Algodv2("", "https://api.testnet.algoexplorer.io", "");
		}
		else if (network === 'betanet') {
			algodClient = new algosdk.Algodv2("", "https://api.betanet.algoexplorer.io", "");
		}
		if (multisig && !threshold) {
			console.log('If more than one --from is specified, set the --threshold also');
			usage();
		}

		if (firstRound) {
			if (firstRound[0] === '+') {
				const params = await algodClient.getTransactionParams().do();
				firstRound = getInteger(firstRound);
				firstRound = params.firstRound + firstRound;
			}
		}
		if (!from && !filein && createTxs) {
			console.log('You need to set at least one --from address');
			usage();
		}
		if (multisig && (threshold > multisig.length || threshold == 0)) {
			console.log('Required threshold is less than one or greater than the number of addresses.');
			process.exit(0);
		}
		if (filein && fileout && !sendTxs && !signTxs) {
			console.log('You need to specify the action with --send or --sign.');
			process.exit(0);
		}

		if (multisig) {
			mparams = {
				version: 1,
				threshold: threshold,
				addrs: multisig
			};
			from = algosdk.multisigAddress(mparams);
		}
		let vaultManager = new vault.VaultManager(algodClient, 0, from, assetId);

		if (filein && !delegateMinter) {
			try {
				txs = await loadTransactionsFromFile(filein);
			}
			catch (err) {
				try {
					lsigMinter = await vaultManager.lsigFromFile(filein);
					delegateMinter = true;
				}
				catch (err) {
					console.log('Cannot load file %s', filein);
					process.exit(0);
				}	
			}
		}
		
		if (createApp || initApp || setMinter || createwALGO || deleteApp || deleteAsset ||
			setGlobalStatus || setAccountStatus || setMintFee || setBurnFee || setCreationFee ||
			optinAsa || closeoutAsa || optin || closeout || mint || burn || withdraw || deposit || transferAsa) {
			createTxs = true;
			if (!from) {
				console.error('You need to set --from address');
				process.exit(0);
			}
		}
		else if ((getMinted || getMaxMint || getMaxWithdraw || getVaultAddr || getVaultBalance) && !from) {
			console.error('You need to set --from address');
			process.exit(0);
		}

		if (!fileout && !sendTxs && createTxs) {
			if (multisig) {
				console.error('Multisig: if --send is not set, set the output file with --out');
				usage();
			}
			sendTxs = true;
		}
		if (!fileout && !signTxs && createTxs && !multisig) {
			// assume --sign if txs will be sent
			signTxs = true;
		}

		if (createwALGO) {
			let name;
			let unitName;
			let url = 'https://stakerdao.com';

			if (network === 'mainnet') {
				name = 'Wrapped Algo';
				unitName = 'wALGO';
			}
			else if (network === 'testnet') {
				name = 'Wrapped Algo Testnet';
				unitName = 'wALGO Ts';
			}
			else {
				name = 'Wrapped Algo Betanet';
				unitName = 'wALGO Bt';
			}
			let txCreatewALGO = await asaTools.createASA(algodClient, from, supply, decimals, unitName, name, url);
			txs.push(txCreatewALGO);
		}
		else if (deleteAsset) {
			let txDeleteAsset = await asaTools.destroyASA(algodClient, from, assetId);
			txs.push(txDeleteAsset);
		}
		else if (createApp) {
			txs = await vaultManager.createApp(from);
		}
		else if (deleteApp) {
			vaultManager.setAppId(appId);
			txs = await vaultManager.deleteApp(from);
		}
		else if (initApp) {
			vaultManager.setAppId(appId);
			vaultManager.setAssetId(assetId);

			txs = await vaultManager.initializeApp(from);
			let txSGS = await vaultManager.setGlobalStatus(from, 1);
			txs.push(txSGS[0]);
		}
		else if (setGlobalStatus) {
			vaultManager.setAppId(appId);

			txs = await vaultManager.setGlobalStatus(from, newStatus);
		}
		else if (setAccountStatus) {
			vaultManager.setAppId(appId);

			txs = await vaultManager.setAccountStatus(from, accountAddr, newStatus);
		}
		else if (setMintFee) {
			vaultManager.setAppId(appId);

			txs = await vaultManager.setMintFee(from, newFee);
		}
		else if (setBurnFee) {
			vaultManager.setAppId(appId);

			txs = await vaultManager.setBurnFee(from, newFee);
		}
		else if (setCreationFee) {
			vaultManager.setAppId(appId);

			txs = await vaultManager.setCreationFee(from, newFee);
		}
		else if (setMinter) {
			vaultManager.setAppId(appId);

			txs = await vaultManager.setMintAccount(from, minterAddr);
		}
		else if (optinAsa) {
			vaultManager.setAssetId(assetId);

			txs = await vaultManager.optInASA(from);
		}
		else if (closeoutAsa) {
			vaultManager.setAssetId(assetId);

			txs = await vaultManager.transferAsset(from, targetAddr, 0, targetAddr);
		}
		else if (transferAsa) {
			vaultManager.setAssetId(assetId);

			txs = await vaultManager.transferAsset(from, targetAddr, wALGOs);
		}
		else if (optin) {
			vaultManager.setAppId(appId);
			vaultManager.setCreator(creatorAddr);

			txs = await vaultManager.optIn(from);
		}
		else if (closeout) {
			vaultManager.setAppId(appId);
			vaultManager.setCreator(creatorAddr);

			txs = await vaultManager.closeOut(from);
		}
		else if (deposit) {
			vaultManager.setAppId(appId);
			vaultManager.setCreator(creatorAddr);

			txs = await vaultManager.depositALGOs(from, algos);
		}
		else if (withdraw) {
			vaultManager.setAppId(appId);
			vaultManager.setCreator(creatorAddr);

			if (algos === -1) {
				algos = await vaultManager.maxWithdrawAmount(from);
			}
			txs = await vaultManager.withdrawALGOs(from, algos);
		}
		else if (mint) {
			vaultManager.setAppId(appId);
			vaultManager.setCreator(creatorAddr);
			vaultManager.delegateMintAccountFromFile(delegationFilepath);

			if (wALGOs === -1) {
				wALGOs = await vaultManager.maxMintAmount(from);
			}
			txs = await vaultManager.mintwALGOs(from, wALGOs);
		}
		else if (burn) {
			vaultManager.setAppId(appId);
			vaultManager.setCreator(creatorAddr);

			if (wALGOs === -1) {
				wALGOs = await vaultManager.minted(from);
			}
			txs = await vaultManager.burnwALGOs(from, wALGOs);
		}
		else if (delegateMinter) {
			if (!fileout) {
				console.error('You need to set --out filename to save minter delegation');
				return;
			}
			vaultManager.setAssetId(assetId);
			vaultManager.setAppId(appId);

			let lsigMinter;

			if (filein) {
				lsigMinter = await vaultManager.lsigFromFile(filein);
			}
			else {
				lsigMinter = await vaultManager.createDelegatedMintAccount(from);
			}

			if (signTxs) {
				await lsigCallback(from, lsigMinter, mparams);
			}

			vaultManager.lsigToFile(lsigMinter, fileout);
			console.log('Minter delegation TEAL stored in file %s', fileout);
			return;
		}
		else if (getGlobalStatus) {
			vaultManager.setAppId(appId);
			vaultManager.setCreator(creatorAddr);

			let status = await vaultManager.globalStatus();
			console.log('Global Status: %d', status);
			return;
		}
		else if (getAccountStatus) {
			vaultManager.setAppId(appId);
			vaultManager.setCreator(creatorAddr);

			let status = await vaultManager.accountStatus(targetAddr);
			console.log('Account Status: %d', status);
			return;
		}
		else if (getMinter) {
			vaultManager.setAppId(appId);
			vaultManager.setCreator(creatorAddr);

			let account = await vaultManager.mintAccount();
			console.log('Minter account: %s', account);
			return;
		}
		else if (getwALGOId) {
			vaultManager.setAppId(appId);
			vaultManager.setCreator(creatorAddr);

			let walgoId = await vaultManager.wALGOId();
			console.log('wALGO id: %d', walgoId);
			return;
		}
		else if (getAdmin) {
			vaultManager.setAppId(appId);
			vaultManager.setCreator(creatorAddr);

			let admin = await vaultManager.adminAccount();
			console.log('Admin account: %s', admin);
			return;
		}
		else if (getMintFee) {
			vaultManager.setAppId(appId);
			vaultManager.setCreator(creatorAddr);

			let fee = await vaultManager.mintFee();
			console.log('Mint fee: %d', fee);
			return;
		}
		else if (getBurnFee) {
			vaultManager.setAppId(appId);
			vaultManager.setCreator(creatorAddr);

			let fee = await vaultManager.burnFee();
			console.log('Burn fee: %d', fee);
			return;
		}
		else if (getCreationFee) {
			vaultManager.setAppId(appId);
			vaultManager.setCreator(creatorAddr);

			let fee = await vaultManager.creationFee();
			console.log('Creation fee: %d', fee);
			return;
		}
		else if (getMinted) {
			vaultManager.setAppId(appId);

			let walgos = await vaultManager.minted(from);
			console.log('Minted for account %s: %d', from, walgos);
			return;
		}
		else if (getMaxMint) {
			vaultManager.setAppId(appId);

			let walgos = await vaultManager.maxMintAmount(from);
			console.log('Maximum amount to mint for account %s: %d', from, walgos);
			return;
		}
		else if (getMaxWithdraw) {
			vaultManager.setAppId(appId);

			let withAlgos = await vaultManager.maxWithdrawAmount(from);
			console.log('Maximum amount to withdraw for account %s: %d', from, withAlgos);
			return;
		}
		else if (getVaultAddr) {
			vaultManager.setAppId(appId);

			let vaultAddr = await vaultManager.vaultAddressByApp(from);
			console.log('Vault address of account %s: %s', from, vaultAddr);
			return;
		}
		else if (getVaultBalance) {
			vaultManager.setAppId(appId);

			let balance = await vaultManager.vaultBalance(from);
			console.log('Vault balance of account %s: %s', from, balance);
			return;
		}
		else if (getMulsigAddr) {
			if (!multisig) {
				console.log('Use multiple --from and --threshold to define the multisig');
				usage();
			}
			console.log('Mulsig address: %s', from);
			return;
		}

		if (createTxs) {
			if (firstRound) {
				for (let i = 0; i < txs.length; i++) {
					if (txs[i].firstRound) {
						txs[i].firstRound = firstRound;
						txs[i].lastRound = firstRound + 1000;
					}
				}
			}
		}
		if (signTxs) {
			if (txs.length === 0) {
				console.error('There are no transactions to sign\n\n');
				usage();
			}

			for (let i = 0; i < txs.length; i++) {
				let txObj;
				if (!txs[i].gen && !txs[i].lastRound) {
					txObj = encoding.decode(txs[i]);
				}
				if (!txObj || !txObj.lsig) {
					txs[i] = await signCallback(from, txs[i], mparams);
				}
			}
		}
		if (sendTxs) {
			// if it is a transaction group send them together
			let txObj = encoding.decode(txs[0]);
			if (txObj.txn.grp) {
				let tx = await algodClient.sendRawTransaction(txs).do();
				console.log('Sent tx: %s', tx.txId);
				let round = await vaultManager.waitForConfirmation(tx.txId);
				console.log('Confirmed in round %d', round);
			}
			else {
				for (let i = 0; i < txs.length; i++) {
					let tx = await algodClient.sendRawTransaction(txs[i]).do();
					console.log('Sent tx: %s', tx.txId);
					let txResponse = await vaultManager.waitForTransactionResponse(tx.txId);
					console.log('Confirmed in round %d', txResponse['confirmed-round']);
					appId = vaultManager.appIdFromCreateAppResponse(txResponse);
					assetId = txResponse['asset-index'];
					if (appId) {
						console.log('Application created successfully! Application Id: %s', appId);
						process.exit(appId);
					}
					else if (assetId) {
						console.log('wALGO created successfully! Asset Id: %s', assetId);
						process.exit(assetId);
					}
				}
			}
		}
		else {
			if (!fileout) {
				console.error('If --sign is not set, set the output file with --out');
				usage();
			}
			await saveTransactionsToFile(txs, fileout);
			console.log('Transaction/s successfully saved to file %s', fileout);
		}
	}
	catch (err) {
		let errObj = err;
		let text;
		if (err.response) {
			errObj = err.response;
		}
		else if (err.error) {
			errObj = err.error;
		}

		if (errObj.text) {
			if (errObj.text.message) {
				text = errObj.text.message;
			}
			else {
				text = errObj.text;
			}
		}
		else if (errObj.message) {
			text = errObj.message;
		}

		console.log('ERROR: ' + text);
	}
}

deployVaultApp();

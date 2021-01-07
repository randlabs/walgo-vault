const fs = require('fs');
const algosdk = require('algosdk');
const vault = require('../vault');
const asaTools = require('../asa-tools');
const msgpack = require("msgpack-lite");
const readline = require('readline');
const transaction = require('algosdk/src/transaction');
const encoding = require('algosdk/src/encoding/encoding');

function usage() {
	console.log('Usage: node deploy-vault.js ' +
		'Commands:' +
		'\t\tcreate-walgo supply decimals\n' +
		'\t\t\tCreate wALGO token, the --from (or multisig) is used as reserve and manager\n' +
		'\t\tdelete-asset asa-id\n' +
		'\t\t\tDelete asset asa-id, --from must be the owner\n' +
		'\t\tcreate-app asa-id\n' +
		'\t\tinit-app wALGO-id app-id\n' +
		'\t\tdelegate-minter wALGO-id app-id\n' +
		'\t\tset-minter app-id minter-address\n' +
		'\t\t--from account-address\n\t\t\tUse --from to set the transaction sender or use it multiple times to setup\n' +
		'\t\t\ta multisig account combined with --multisig-threshold\n' +
		'\t\t--in filein\n\t\t\tLoad transactions from file. Useful to sign and send transactions previously generated\n' +
		'\t\t--out fileout\n\t\t\tGenerate the transactions and dump them to a file\n' +
		'\t\t--private-key\n\t\t\tUse this private key to sign transactions. Remomended only for test purposes.\n' +
		'\t\t--print-txs\n\t\t\tPrint transactions before signing\n' +
		'\t\t--multisig-threshold\n\t\t\tIf there is more than one --from it sets the to set the multisig threshold\n' +
		'\t\t--net mainnet|testnet|betanet (default: testnet)\n' +
		'\t\t--sign-txs\n\t\t\tSign transactions created or loaded from file\n' +
		'\t\t--send-txs\n\t\t\tSend signed transaction/s from file\n');

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

	if (!signatures[sender] || mparams) {
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

	if (!mparams) {
		const txSigned = tx.signTxn(signatures[sender].sk);
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

async function lsigCallback(sender, lsig) {
	if (!signatures[sender]) {
		console.log('Enter mnemonic for %s:', sender);
		const line = await readLineAsync();
		let key = algosdk.mnemonicToSecretKey(line);
		if (key.addr !== sender) {
			console.error('Key does not match the sender');
			process.exit(1);
		}
		// eslint-disable-next-line require-atomic-updates
		signatures[sender] = key;
	}

	lsig.sign(signatures[sender].sk);
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
	let createwALGO;
	let deleteAsset;
	let initApp;
	let appId;
	let delegateMinter;
	let setMinter;
	let minterAddr;
	let network = 'testnet';
	let supply;
	let decimals;
	let txs = [];

	try {
		// get general configurations
		for (let idx = 2; idx < process.argv.length; idx++) {
			if (process.argv[idx] == 'create-app') {
				createApp = true;
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
				// get asa-id
				appId = getInteger(process.argv[idx]);
				// get minter-address
				idx += 1;
				minterAddr = getAddress(process.argv[idx]);
				setMinter = true;
			}
			else if (process.argv[idx] == 'delegate-minter') {
				if (idx + 2 >= process.argv.length) {
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

				if (from) {
					multisig = [ from ];
					from = undefined;
				}
				else {
					from = getAddress(process.argv[idx]);
				}
				if (multisig) {
					multisig.push(getAddress(process.argv[idx]));
				}
			}
			else if (process.argv[idx] == '--multisig-threshold') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				threshold = getInteger(process.argv[idx]);
			}
			else if (process.argv[idx] == '--send-txs') {
				sendTxs = true;
			}
			else if (process.argv[idx] == '--sign-txs') {
				signTxs = true;
			}
			else if (process.argv[idx] == '--print-txs') {
				printTxs = true;
			}
			else if (process.argv[idx] == '--private-key') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				privateKey = process.argv[idx];
				if (privateKey.indexOf('\'') >= 0 && privateKey.indexOf('"') >= 0) {
					privateKey = process.privateKey.substring(1, privateKey.length - 1);
				}
				console.log(privateKey);
				privateKey = algosdk.mnemonicToSecretKey(privateKey);
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
			console.log('If more than one --from is specified, set the --multisig-threshold also');
			process.exit(0);
		}

		if (!from && !filein) {
			console.log('You need to set at least one --from address');
			process.exit(0);
		}
		if (multisig && (threshold > multisig.length || threshold == 0)) {
			console.log('Required threshold is less than one or greater than the number of addresses.');
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

		if (!fileout && !sendTxs) {
			console.error('If --send-txs is not set, set the output file with --out');
			usage();
		}

		if (filein) {
			txs = await loadTransactionsFromFile(filein);
		}

		if ((createApp || initApp || setMinter || createwALGO) && !from) {
			console.error('You need to set --from address');
			process.exit(0);
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
				unitName = 'wALGO Ts';
			}
			let txCreatewALGO = await asaTools.createASA(algodClient, from, supply, decimals, unitName, name, url);
			txs.push(txCreatewALGO);
		}
		else if (deleteAsset) {
			let txDeleteAsset = await asaTools.destroyASA(algodClient, from, assetId);
			txs.push(txDeleteAsset);
		}
		else if (createApp) {
			let txCreateApp = await vaultManager.createApp(from);
			txs.push(txCreateApp);
		}
		else if (initApp) {
			vaultManager.setAppId(appId);
			vaultManager.setAssetId(assetId);

			let txInitApp = await vaultManager.initializeApp(from);
			let txEnableApp = await vaultManager.setGlobalStatus(from, 1);
			txs.push(txInitApp);
			txs.push(txEnableApp);
		}
		else if (setMinter) {
			vaultManager.setAppId(appId);

			let txSetMintAccount = await vaultManager.setMintAccount(from, minterAddr);
			txs.push(txSetMintAccount);
		}
		else if (delegateMinter) {
			if (!fileout) {
				console.error('You need to set --out filename to save minter delegation');
			}
			vaultManager.setAssetId(assetId);
			vaultManager.setAppId(appId);
			vaultManager.createDelegatedMintAccountToFile(fileout, lsigCallback);
			console.log('Minter delegation TEAL signed in file %s', fileout);
			return;
		}

		if (signTxs) {
			if (txs.length === 0) {
				console.error('There are no transactions to sign\n\n');
				usage();
			}

			for (let i = 0; i < txs.length; i++) {
				txs[i] = await signCallback(from, txs[i], mparams);
			}
		}
		if (sendTxs) {
			for (let i = 0; i < txs.length; i++) {
				let tx = await algodClient.sendRawTransaction(txs[i]).do();
				console.log('Sent tx: %s', tx.txId);
				let txResponse = await vaultManager.waitForTransactionResponse(tx.txId);
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
		else {
			if (!fileout) {
				console.error('If --sign-txs is not set, set the output file with --out');
				usage();
			}
			await saveTransactionsToFile(txs, fileout);
			console.log('Transaction/s successfully saved to file %s', fileout);
		}
	}
	catch (err) {
		let text = err.error;

		if (err.text) {
			text = err.text;
		}
		else if (err.message) {
			text = err.message;
		}

		console.log('ERROR: ' + text);
		usage();
	}
}

deployVaultApp();

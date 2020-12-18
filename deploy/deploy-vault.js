const fs = require('fs');
const algosdk = require('algosdk');
const vault = require('../vault');
const asaTools = require('../asa-tools');
const signTools = require('./sign');
const addresses = require('./addresses');
const msgpack = require("msgpack-lite");
const { getMultiSignatureSigners } = require('./sign');
const readline = require('readline');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

function usage() {
	console.log('Usage: node deploy-vault.js ' +
		'Commands:' +
		'\t\tcreate-walgo supply decimals' +
		'\t\t\tCreate wALGO token, the --from (or multisig) is used as reserve and manager\n' +
		'\t\tcreate-app asa-id' +
		'\t\tinit-app wALGO-id app-id' +
		'\t\tdelegate-minter wALGO-id app-id' +
		'\t\tset-minter app-id minter-address' +
		'\t\t--from account-address\n\t\t\tUse --from to set the transaction sender or use it multiple times to setup\n' +
		'\t\t\ta multisig account combined with --multisig-threshold\n' +
		'\t\t--in filein\n\t\t\tLoad transactions from file. Useful to sign and send transactions previously generated\n' +
		'\t\t--out fileout\n\t\t\tGenerate the transactions and dump them to a file\n' +
		'\t\t--multisig-threshold\n\t\t\tIf there is more than one --from it sets the to set the multisig threshold\n' +
		'\t\t--net mainnet|testnet|betanet (default: testnet)\n' +
		'\t\t--sign-txs\n\t\t\tSign transactions created or loaded from file\n' +
		'\t\t--send-txs\n\t\t\tSend signed transaction/s from file\n');

	process.exit(0);
}

async function readLineAsync() {
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
};

let signatures = {};

async function signCallback(sender, tx) {
	if (!signatures[sender]) {
		console.log('Enter mnemonic for %s:', sender);
		const line = await readLineAsync();
		let key = algosdk.mnemonicToSecretKey(line);
		// eslint-disable-next-line require-atomic-updates
		signatures[sender] = key;
	}

	const txSigned = tx.signTxn(signatures[sender].sk);
	return txSigned;

	if (sender == 'EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4') {
		let key = algosdk.mnemonicToSecretKey('fiber fringe dune upper chat six rich maze morning pistol square ' +
		'decorate own erosion they stem fluid cube expose census media coconut odor above hard');
		const txSigned = tx.signTxn(key.sk);
		return txSigned;
	}
	return;


	const mparams = {
		version: 1,
		threshold: 1,
		addrs: [
			'CV3U3AV6WY4Q22QLGYUQYFBF6DQWZLK23S5PBLFXRI3MWVQHVUHIE7EZB4',
			'DDA62FAYHSPYBSGKXQPUFNL2IG5WPMYQNPQS44YW5X4NER7ABNUOVHL4M4'
		],
	};
	//let key = algosdk.mnemonicToSecretKey('worry sphere situate rib update trumpet glove mechanic perfect glare cost cart agree drastic spin blanket what flash orient utility grow focus zebra abandon leave');
	// const txSigned = tx.signTxn(key.sk);
	//const txSigned = algosdk.signMultisigTransaction(tx, mparams, key.sk).blob;
	// const txSigned = tx.signTxn(settings.signatures[sender].sk);
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
		throw new Error("Invalid filename (tx-storage).");
	}

	//create decoder stream
	let decodeStream = msgpack.createDecodeStream();
	decodeStream.on("data", (_tx) => {
		txs.push(_tx);
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

function getAddress(arg) {
	if (arg.length != 58) {
		console.log('Invalid address %s\n', arg);
		usage();
	}
	return arg;
}

function getStatus(status) {
	if (status != 1 && status != 0) {
		console.log('Invalid Status: %s', status);
		usage();
	}
	return status;
}

function getInteger(amount) {
	if (Number.isInteger(amount) || amount < 0) {
		console.log('Invalid Amount: %s', amount);
		usage();
	}
	amount = parseInt(amount, 10);
	return amount;
}

function sendToFile(fileout, tx) {
	let encodedObj = tx.get_obj_for_encoding();
	let txEncoded = algosdk.encodeObj(encodedObj);
	if (fileout) {
		let buf = Buffer.from(txEncoded);
		// eslint-disable-next-line security/detect-non-literal-fs-filename
		fs.writeFileSync(fileout, buf);
	}
}

async function deployVaultApp() {
	let filein;
	let fileout;
	let txsFile;
	let from;
	let multisig;
	let assetId;
	let threshold;
	let sendTxs;
	let signTxs;
	let createApp;
	let createwALGO;
	let initApp;
	let appId;
	let delegateMinter;
	let setMinter;
	let minterAddr;
	let network = 'testnet';
	let supply;
	let decimals;

	try {
		// get general configurations
		for (let idx = 0; idx < process.argv.length; idx++) {
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
			else if (process.argv[idx] == '--asset-id') {
				if (idx + 1 >= process.argv.length) {
					usage();
				}

				idx += 1;
				assetId = getInteger(process.argv[idx]);
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

		if (!multisig && !from) {
			console.log('You need to set at least one --from address');
			process.exit(0);
		}
		if (multisig && (threshold > multisig.length || threshold == 0)) {
			console.log('Required threshold is less than one or greater than the number of addresses.');
			process.exit(0);
		}

		if (multisig) {
			from = addresses.generateMultisig(multisig, threshold);
		}
		let vaultManager = new vault.VaultManager(algodClient, 0, from, assetId);

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
			if (signTxs) {
				let txCreatewALGO = await asaTools.createASA(algodClient, from, supply, decimals, unitName, name, url, signCallback, false);
				if (sendTxs) {
					let tx = await algodClient.sendRawTransaction(txCreatewALGO).do();
					let txResponse = await vaultManager.waitForTransactionResponse(tx.txId);
					assetId = txResponse['asset-index'];
					console.log('Asset created with index %d', assetId);
				}
				else {
					if (!fileout) {
						console.error('If --send-txs is not set, set the output file with --out');
						usage();
					}
					sendToFile(fileout);
				}
			}
			else {
				if (!fileout) {
					console.error('If --sign-txs is not set, set the output file with --out');
					usage();
				}
				let txCreatewALGO = await asaTools.createASA(algodClient, from, supply, decimals, unitName, name, url);
				sendToFile(txCreatewALGO);
			}
			return;
		}

		if ((createApp || initApp || setMinter || createwALGO) && !from) {
			console.error('You need to set --from address');
			process.exit(0);
		}

		if (createApp) {
			let txCreateApp = await vaultManager.createApp(from);
			if (signTxs) {
				console.log('Sign createApp transaction:');
				let txCreateAppSigned = await signCallback(from, txCreateApp);

				if (sendTxs) {
					let tx = await algodClient.sendRawTransaction(txCreateAppSigned).do();
					let txResponse = await vaultManager.waitForTransactionResponse(tx.txId);
					appId = vaultManager.appIdFromCreateAppResponse(txResponse);
					console.log('Application created successfully! Application Id: ', appId);
				}
			}
			return;
		}
		if (initApp) {
			vaultManager.setAppId(appId);
			vaultManager.setAssetId(assetId);

			let txInitApp = await vaultManager.initializeApp(from);
			let txEnableApp = await vaultManager.setGlobalStatus(from, 1);
			if (signTxs) {
				console.log('Sign initApp and setGlobalStatus(1) transactions:');
				let txInitAppSigned = await signCallback(from, txInitApp);
				let txEnableAppSigned = await signCallback(from, txEnableApp);

				if (sendTxs) {
					let tx = await algodClient.sendRawTransaction(txInitAppSigned).do();
					await vaultManager.waitForTransactionResponse(tx.txId);
					console.log('initApp txid: ' + tx.txId);
					tx = await algodClient.sendRawTransaction(txEnableAppSigned).do();
					await vaultManager.waitForTransactionResponse(tx.txId);
					console.log('setGlobalStatus(1) txid: ' + tx.txId);
					console.log('Application initialized successfully!');
				}
			}
			return;
		}
		if (setMinter) {
			vaultManager.setAppId(appId);

			let txSetMintAccount = await vaultManager.setMintAccount(from, minterAddr);
			if (signTxs) {
				console.log('Sign setMintAccount transactions:');
				let txSetMintAccountSigned = await signCallback(from, txSetMintAccount);

				if (sendTxs) {
					let tx = await algodClient.sendRawTransaction(txSetMintAccountSigned).do();
					await vaultManager.waitForTransactionResponse(tx.txId);
					console.log('setMintAccount txid: ' + tx.txId);
					console.log('setMintAccount successfully!');
				}
			}
			return;
		}

		if (delegateMinter) {
			if (!fileout) {
				console.error('You need to set --out filename to save minter delegation');
			}
			vaultManager.setAssetId(assetId);
			vaultManager.setAppId(appId);
			await vaultManager.createDelegatedMintAccountToFile(fileout, lsigCallback);
			console.log('Minter delegation TEAL signed in file %s', fileout);
			return;
		}

		// send transaction batch file
		if (sendTxs) {
			let txBatch = await loadTransactionsFromFile(txsFile);
			// let txBatchDecoded = algosdk.decodeObj(txBatch);
			let tx = await algodClient.sendRawTransaction(txBatch[0]).do();
			tx = await algodClient.sendRawTransaction(txBatch[1]).do();
			console.log('Transactions submitted. Last tx id %s', tx.txId);
			return;
		}


		// let encodedObj = txCreateApp.get_obj_for_encoding();
		// let txCreateAppEncoded = algosdk.encodeObj(encodedObj);

		if (multisig) {
			let encodedObj = txCreateApp.get_obj_for_encoding();
			let txCreateAppMultisig = { txn: encodedObj };
			signTools.addSignatureTemplate(txCreateAppMultisig, threshold, multisig);
			let txCreateAppMultisigEncoded = algosdk.encodeObj(txCreateAppMultisig);
			if (fileout) {
				let buf = Buffer.from(txCreateAppMultisigEncoded);
				fs.writeFileSync(fileout, buf);
			}

			encodedObj = txInitApp.get_obj_for_encoding();
			let txInitAppMultisig = { txn: encodedObj };
			signTools.addSignatureTemplate(txInitAppMultisig, threshold, multisig);
			encodedObj = txEnableApp.get_obj_for_encoding();
			let txEnableAppMultisig = { txn: encodedObj };
			signTools.addSignatureTemplate(txEnableAppMultisig, threshold, multisig);
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

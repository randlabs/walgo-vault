/* eslint-disable global-require */
/*************************************************************************
 *  [2018] - [2020] Rand Labs Inc.
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Rand Labs Inc.
 * The intellectual and technical concepts contained
 * herein are proprietary to Rand Labs Inc.
 */

const process = require('process');
const path = require('path');
const algosdk = require('algosdk');

// ------------------------------------------------------------------------------
let settings = null;
let algodClient = null;
let addresses = {};
let signatures = {};

// ------------------------------------------------------------------------------
function initialize() {
	// setup the settings filename
	let filename = 'settings';
	for (let idx = 0; idx < process.argv.length; idx++) {
		// eslint-disable-next-line security/detect-object-injection
		if (process.argv[idx] == '--settings') {
			if (idx + 1 >= process.argv.length) {
				throw new Error('ERROR: Missing filename in "--settings" parameter.');
			}
			filename = process.argv[idx + 1];
		}
	}

	try {
		filename = path.resolve(__dirname, '.', filename);

		// eslint-disable-next-line security/detect-non-literal-require
		settings = require(filename);

		recoverAccounts();
		setupClient();

		settings.algodClient = algodClient;
		settings.signatures = signatures;
		settings.addresses = addresses;
		settings.admin = !settings.noAdmin;

	}
	catch (err) {
		throw new Error('ERROR: Unable to load settings file.');
	}

	settings.base_dir = path.dirname(filename);
	if (!settings.base_dir.endsWith(path.sep)) {
		settings.base_dir += path.sep;
	}

	return settings;
}

function recoverAccounts () {
	for (let i = 0; i < 20; i++) {
		if (settings["account" + i]) {
			addresses[i] = settings["account" + i].publicKey;
			if (settings["account" + i].privateKey) {
				signatures[addresses[i]] = algosdk.mnemonicToSecretKey(settings["account" + i].privateKey);
			}
		}
		else {
			break;
		}
	}
	if (settings.minterAccount) {
		settings.minterAddress = settings.minterAccount.publicKey;
		signatures[settings.minterAddress] = algosdk.mnemonicToSecretKey(settings.minterAccount.privateKey);
	}
	if (settings.dispenserAccount) {
		settings.dispenserAddress = settings.dispenserAccount.publicKey;
		signatures[settings.dispenserAddress] = algosdk.mnemonicToSecretKey(settings.dispenserAccount.privateKey);
	}
	if (settings.clearStateAttackAccount) {
		settings.clearStateAttackAddr = settings.clearStateAttackAccount.publicKey;
		signatures[settings.clearStateAttackAddr] = algosdk.mnemonicToSecretKey(settings.clearStateAttackAccount.privateKey);
	}
}

function setupClient() {
	if (!algodClient) {
		algodClient = new algosdk.Algodv2(settings.algodClient.apiToken, settings.algodClient.server, settings.algodClient.port);
	}
	else {
		return algodClient;
	}

	return algodClient;
}

// ------------------------------------------------------------------------------
module.exports = {
	initialize
};

/*************************************************************************
 *  [2018] - [2020] Rand Labs Inc.
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Rand Labs Inc.
 * The intellectual and technical concepts contained
 * herein are proprietary to Rand Labs Inc.
 */

const process = require('process')
const path = require('path')
const algosdk = require('algosdk')

// ------------------------------------------------------------------------------
let settings = null
let algodClient = null
let accounts = {}
let signatures = {}

// ------------------------------------------------------------------------------
function initialize() {
	// setup the settings filename
	let filename = 'settings'
	for (let idx = 0; idx < process.argv.length; idx++) {
		// eslint-disable-next-line security/detect-object-injection
		if (process.argv[idx] == '--settings') {
			if (idx + 1 >= process.argv.length) {
				throw new Error('ERROR: Missing filename in "--settings" parameter.')
			}
			filename = process.argv[idx + 1]
		}
	}

	try {
		filename = path.resolve(__dirname, '.', filename)

		settings = require(filename)

		recoverManagerAccount()
		setupClient()

		settings.algodClient = algodClient
		settings.signatures = signatures
		settings.accounts = accounts			
	} catch (err) {
		throw new Error('ERROR: Unable to load settings file.')
	}

	settings.base_dir = path.dirname(filename)
	if (!settings.base_dir.endsWith(path.sep)) {
		settings.base_dir += path.sep
	}

	return settings
}

function recoverManagerAccount () {
	accounts[0] = algosdk.mnemonicToSecretKey(settings.account0.privateKey)
	signatures[accounts[0].addr] = accounts[0]
	accounts[1] = algosdk.mnemonicToSecretKey(settings.account1.privateKey)
	signatures[accounts[1].addr] = accounts[1]
	accounts[2] = algosdk.mnemonicToSecretKey(settings.account2.privateKey)
	signatures[accounts[2].addr] = accounts[2]
	accounts[3] = algosdk.mnemonicToSecretKey(settings.account3.privateKey)
	signatures[accounts[3].addr] = accounts[3]
	accounts[4] = algosdk.mnemonicToSecretKey(settings.account4.privateKey)
	signatures[accounts[4].addr] = accounts[4]
	accounts[5] = algosdk.mnemonicToSecretKey(settings.account5.privateKey)
	signatures[accounts[5].addr] = accounts[5]
	accounts[6] = algosdk.mnemonicToSecretKey(settings.account6.privateKey)
	signatures[accounts[6].addr] = accounts[6]
}

async function setupClient() {
	if (algodClient == null) {
		algodClient = new algosdk.Algodv2(settings.algodClient.apiToken, settings.algodClient.server, settings.algodClient.port)
	} else {
		return algodClient
	}

	return algodClient
}

// ------------------------------------------------------------------------------
module.exports = {
	initialize
}

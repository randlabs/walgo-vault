const algosdk = require('algosdk')
const vault = require('./vault')
const config = require('./config')

function usage() {
	console.log('Usage: node vault-cli.js\n' + 
		'\tGeneral Parameters:\n' +
		'\t\t--from, -f address-or-account-index\n' + 
		'\tAdmin Operations:\n' +
		'\t\t--create-app, -c\n' + 
		'\t\t--update-app, -u\n' + 
		'\t\t--set-admin-account, -saa address-or-account-index\n' + 
		'\t\t--set-global-status, -sgs 0|1\n' + 
		'\t\t--set-account-status, -sas address-or-account-index 0|1\n' + 
		'\t\t--set-mint-fee, -smf 0-5000 (0%-50%)\n' + 
		'\t\t--set-burn-fee, -sbf 0-5000 (0%-50%)\n' + 
		'\t\t--set-creation-fee, -scf microALGOs\n' + 
		'\t\t--set-mint-account, -sma address-or-account-index\n' + 
		'\tUser Operations:\n' +
		'\t\t--optin, -o\n' +
		'\t\t--optin-asa, -oa\n' +
		'\t\t--closeout, -c\n' +
		'\t\t--deposit, -d amount\n' +
		'\t\t--withdraw, -w amount\n' +
		'\t\t--mint, -m amount\n' +
		'\t\t--burn, -b amount\n'
	)

	process.exit(0)
}

function signCallback(sender, tx) {
	const txSigned = tx.signTxn(settings.signatures[sender].sk)
	return txSigned
}

function getAddress(arg) {
	// assume an index
	if(arg.length < 10) {
		arg = settings.addresses[arg]
	}
	else {
		arg = settings.signatures[arg].addr
	}
	if(arg.length != 58) {
		console.log('Invalid address %s\n', arg)
		usage()
	}
	return arg
}

function getStatus(status) {
	if(status != 1 && status != 0) {
		console.log('Invalid Status: %s', status)
		usage()
	}
	return status
}

function getAmount(amount) {
	if(Number.isInteger(amount) || amount < 0) {
		console.log('Invalid Amount: %s', amount)
		usage()
	}
	amount = parseInt(amount, 10)
	return amount
}



async function main() {
	let from
	let addresses = settings.addresses
	let signatures = settings.signatures
	let txId
	let promise

	let vaultManager = new vault.VaultManager(settings.algodClient, settings.appId, addresses[0], settings.assetId)

	try {
		// get general configurations
		for(let idx = 0; idx < process.argv.length; idx++) {
			if (process.argv[idx] == '--from' || process.argv[idx] == '-f') {
				if(idx + 1 >= process.argv.length) {
					usage()
				}

				from = getAddress(process.argv[++idx])
			}
		}

		// execute commands
		for(let idx = 0; idx < process.argv.length; idx++) {
			// Admin Operations
			if(process.argv[idx] == '--create-app' || process.argv[idx] == '-c') {
				if(!from) {
					usage()
				}
				promise = vaultManager.createApp(from, signCallback)
				break
			}
			else if (process.argv[idx] == '--update-app' || process.argv[idx] == '-u') {
				if(!from) {
					usage()
				}

				promise = vaultManager.updateApp(from, signCallback)
				break
			}
			else if (process.argv[idx] == '--set-global-status' || process.argv[idx] == '-sgs') {
				if(idx + 1 >= process.argv.length || !from || process.argv[idx+1] != 1 && process.argv[idx+1] != 0) {
					usage()
				}

				promise = vaultManager.setGlobalStatus(from, process.argv[idx+1], signCallback)
				break
			}
			else if (process.argv[idx] == '--set-account-status' || process.argv[idx] == '-sas') {
				if(idx + 2 >= process.argv.length || !from) {
					usage()
				}

				let addr = getAddress(process.argv[idx+1])
				let status = getStatus(process.argv[idx+2])

				promise = await vaultManager.setAccountStatus(from, addr, status, signCallback)
				break
			}
			else if (process.argv[idx] == '--set-admin-account' || process.argv[idx] == '-saa') {
				if(idx + 1 >= process.argv.length || !from) {
					usage()
				}

				let addr = getAddress(process.argv[idx+1])

				promise = vaultManager.setAdminAccount(from, addr, signCallback)
				break
			}
			else if (process.argv[idx] == '--set-mint-account' || process.argv[idx] == '-sma') {
				if(idx + 1 >= process.argv.length || !from) {
					usage()
				}

				let addr = getAddress(process.argv[idx+1])

				promise = vaultManager.setMintAccount(from, addr, signCallback)
				break
			}
			else if (process.argv[idx] == '--set-mint-fee' || process.argv[idx] == '-smf') {
				if(idx + 1 >= process.argv.length || !from || process.argv[idx+1] > 5000 && process.argv[idx+1] < 0) {
					usage()
				}

				promise = vaultManager.setMintFee(from, process.argv[idx+1], signCallback)
				break
			}
			else if (process.argv[idx] == '--set-burn-fee' || process.argv[idx] == '-sbf') {
				if(idx + 1 >= process.argv.length || !from || process.argv[idx+1] > 5000 && process.argv[idx+1] < 0) {
					usage()
				}

				promise = vaultManager.setBurnFee(from, process.argv[idx+1], signCallback)
				break
			}
			else if (process.argv[idx] == '--set-creation-fee' || process.argv[idx] == '-scf') {
				if(idx + 1 >= process.argv.length || !from || process.argv[idx+1] < 0) {
					usage()
				}

				promise = vaultManager.setCreationFee(from, process.argv[idx+1], signCallback)
				break
			}
			else if (process.argv[idx] == '--withdraw-admin-fees' || process.argv[idx] == '-waf') {
				if(idx + 2 >= process.argv.length || !from) {
					usage()
				}

				let addr = getAddress(process.argv[idx+1])
				let amount = getAmount(process.argv[idx+2])

				promise = vaultManager.withdrawAdminFees(from, addr, amount, signCallback)
				break
			}
			// User Operations
			else if (process.argv[idx] == '--optin' || process.argv[idx] == '-o') {
				if(!from) {
					usage()
				}

				promise = vaultManager.optIn(from, signCallback)
				break
			}
			else if (process.argv[idx] == '--optin-asa' || process.argv[idx] == '-oa') {
				if(!from) {
					usage()
				}

				promise = vaultManager.optInASA(from, signCallback)
				break
			}
			else if (process.argv[idx] == '--closeout' || process.argv[idx] == '-c') {
				if(!from) {
					usage()
				}

				promise = vaultManager.closeOut(from, signCallback)
				break
			}
			else if (process.argv[idx] == '--deposit' || process.argv[idx] == '-d') {
				if(idx + 1 >= process.argv.length || !from) {
					usage()
				}

				let amount = getAmount(process.argv[idx+1])

				promise = vaultManager.depositALGOs(from, amount, signCallback)
				break
			}
			else if (process.argv[idx] == '--withdraw' || process.argv[idx] == '-w') {
				if(idx + 1 >= process.argv.length || !from) {
					usage()
				}

				let amount = getAmount(process.argv[idx+1])

				promise = vaultManager.withdrawALGOs(from, amount, signCallback)
				break
			}
			else if (process.argv[idx] == '--mint' || process.argv[idx] == '-m') {
				if(idx + 1 >= process.argv.length || !from) {
					usage()
				}

				let amount = getAmount(process.argv[idx+1])

				promise = vaultManager.mintwALGOs(from, amount, signCallback)
				break
			}
			else if (process.argv[idx] == '--burn' || process.argv[idx] == '-b') {
				if(idx + 1 >= process.argv.length || !from) {
					usage()
				}

				let amount = getAmount(process.argv[idx+1])

				promise = vaultManager.burnwALGOs(from, amount, signCallback)
				break
			}
		}
	} catch(err) {
		usage()
	}
	if(promise) {
		try {
			txId = await promise
			console.log('Waiting for transaction...')
			let txResponse = await vaultManager.waitForTransactionResponse(txId)
			console.log('Transaction successfully submitted: %s.', txId)
			if(vaultManager.anyAppCallDelta(txResponse)) {
				vaultManager.printAppCallDelta(txResponse)
			}
		}
		catch(err) {
			console.log('Error submitting transactions: ' + (err.body && err.body.message ? err.body.message : err.message))
		}
	}
	else {
		usage()
	}
}

settings = config.initialize()

main()
const algosdk = require('algosdk')
const vault = require('./vault')
const config = require('./config')

function usage() {
	console.log('Usage: node vault-cli.js\n' + 
		'\t\t--from|-f address or account index\n' + 
		'\tAdmin Operations:\n' +
		'\t\t--create-app|-c\n' + 
		'\t\t--app-id|-a app-id\n' + 
		'\t\t--status|-s 0|1\n' + 
		'\t\t--account-status|-as 0|1\n' + 
		'\t\t--mint-fee|-mf 0-5000 (0%-50%)\n' + 
		'\t\t--burn-fee|-bf 0-5000 (0%-50%)\n' + 
		'\t\t--creation-fee|-cf microALGOs\n' + 
		'\tUser Operations:\n' +
		'\t\t--optin|-o\n' +
		'\t\t--close|-c\n' +
		'\t\t--deposit|-d amount\n' +
		'\t\t--withdraw|-w amount\n' +
		'\t\t--mint|-m amount\n' +
		'\t\t--burn|-b amount\n'
	)

	process.exit(1)
}

function signCallback(sender, tx) {
	const txSigned = tx.signTxn(settings.signatures[sender].sk)
	return txSigned
}

function getAddress(arg) {
	// assume an index
	if(arg.length < 10) {
		arg = settings.accounts[arg].addr
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
	return amount
}



async function main() {
	let from
	let accounts = settings.accounts
	let signatures = settings.signatures
	let txId

	let vaultManager = new vault.VaultManager(settings.algodClient, settings.appId, accounts[0].addr, settings.assetId)

	try {
		for(let idx = 0; idx < process.argv.length; idx++) {
			// Admin Operations
			if(process.argv[idx] == '--create-app' || process.argv[idx] == '-c') {
				if(!from) {
					usage()
				}
				promise = vaultManager.createApp(from, signCallback)
				break
			}
			else if (process.argv[idx] == '--from' || process.argv[idx] == '-f') {
				if(idx + 1 >= process.argv.length) {
					usage()
				}

				from = getAddress(process.argv[++idx])
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
			else if (process.argv[idx] == '--opt-in' || process.argv[idx] == '-o') {
				if(!from) {
					usage()
				}

				promise = vaultManager.optIn(from, signCallback)
				break
			}
			else if (process.argv[idx] == '--close-out' || process.argv[idx] == '-c') {
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
}

settings = config.initialize()

main()
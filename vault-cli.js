const algosdk = require('algosdk')
const vault = require('./vault')
const config = require('./config')

function usage() {
	console.log('Usage: node vault-cli.js\n' + 
		'\tGeneral Parameters:\n' +
		'\t\t--account, -f address-or-account-index\n' + 
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
		'\t\t--burn, -b amount\n' +
		'\tGlobal Status:\n' +
		'\t\t--status\n' +
		'\t\t--admin-account\n' +
		'\t\t--mint-fee\n' +
		'\t\t--creation-fee\n' +
		'\t\t--burn-fee\n' +
		'\t\t--mint-account\n' +
		'\tLocal Status: Use --account to specify account\n' +
		'\t\t--minted\n' +
		'\t\t--vault-addr\n' +
		'\t\t--account-status\n' +
		'\t\t--admin-fees\n'
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
	let txId
	let promise
	let read

	let vaultManager = new vault.VaultManager(settings.algodClient, settings.appId, addresses[0], settings.assetId)

	try {
		// get general configurations
		for(let idx = 0; idx < process.argv.length; idx++) {
			if (process.argv[idx] == '--account' || process.argv[idx] == '-a') {
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
			// Global Status
			else if (process.argv[idx] == '--status') {
				let status = await vaultManager.globalStatus()
				console.log('Global Status: %d', status)
				return
			}
			else if (process.argv[idx] == '--admin-account') {
				let address = await vaultManager.adminAccount()
				console.log('Admin Account: %s', address)
				return
			}
			else if (process.argv[idx] == '--mint-account') {
				let address = await vaultManager.mintAccount()
				console.log('Mint Account: %s', address)
				return
			}
			else if (process.argv[idx] == '--mint-fee') {
				let fee = await vaultManager.mintFee()
				console.log('Mint Fee: %d%', fee/100)
				return
			}
			else if (process.argv[idx] == '--burn-fee') {
				let fee = await vaultManager.burnFee()
				console.log('Burn Fee: %d%', fee/100)
				return
			}
			else if (process.argv[idx] == '--creation-fee') {
				let fee = await vaultManager.creationFee()
				console.log('Creation Fee: %d algos', fee/1000000)
				return
			}
			// Local Status
			else if (process.argv[idx] == '--minted') {
				if(!from) {
					console.log('Local status operations require --account')
					usage()
				}
				let minted = await vaultManager.minted(from)
				console.log('Minted: %d wALGOs', minted/1000000)
				return
			}
			else if (process.argv[idx] == '--vault-addr') {
				if(!from) {
					console.log('Local status operations require --account')
					usage()
				}
				let address = await vaultManager.vaultAddressByTEAL(from)
				console.log('Vault address for %s: %s', from, address)
				return
			}
			else if (process.argv[idx] == '--account-status') {
				if(!from) {
					console.log('Local status operations require --account')
					usage()
				}
				let status = await vaultManager.accountStatus(from)
				console.log('Account Status: %d', status)
				return
			}
			else if (process.argv[idx] == '--admin-fees') {
				if(!from) {
					console.log('Local status operations require --account')
					usage()
				}
				let fees = await vaultManager.adminVaultFees(from)
				console.log('Admin fees collected on Account %s: %d', from, fees)
				return
			}
			else if (process.argv[idx] == '--vault-balance') {
				if(!from) {
					console.log('Local status operations require --account')
					usage()
				}
				let address = await vaultManager.vaultAddressByTEAL(from)
				let balance = await vaultManager.vaultBalance(from)
				console.log('Vault of account %s: %s balance %d', from, address, balance)
				return
			}
		}
	} catch(err) {
		let text =  err.error

		if (err.text) {
			text = err.text
		}
		else if (err.message) {
			text = err.message
		}

		console.log('ERROR: ' + text)
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
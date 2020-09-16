const algosdk = require('algosdk')
const asaTools = require('./asa-tools')
const vault = require('./vault')
const config = require('./config')

let algodClient
let vaultAdmin
let account1
let account2
let account3
let account4
let account5
let settings

function recoverManagerAccount () {
	// Private key mnemonic: town memory type rapid ugly aim yard moon rocket lobster survey series mesh plate great seed company vote debris limb view motion label absorb swear

	// WALBWVI43IKS7YJJADD7WGE4C4TS3OTOJOEAVEWNXEJS6CXH7OJIVKKHME
	//  const passphrase = 'clay vast only enact sibling axis seven around drip cruise era alcohol police web planet increase winter exclude rain pyramid art alert tool absent pave'
	//  return myAccount

	// const myAccount = algosdk.mnemonicToSecretKey(passphrase)
	vaultAdmin = algosdk.mnemonicToSecretKey(settings.managerAccount.privateKey)
	account1 = algosdk.mnemonicToSecretKey(settings.account1.privateKey)
	account2 = algosdk.mnemonicToSecretKey(settings.account2.privateKey)
	account3 = algosdk.mnemonicToSecretKey(settings.account3.privateKey)
	account4 = algosdk.mnemonicToSecretKey(settings.account4.privateKey)
	account5 = algosdk.mnemonicToSecretKey(settings.account5.privateKey)
}

async function setupClient () {
	if (algodClient == null) {
		settings = config.get()

		algodClient = new algosdk.Algodv2(settings.algodClient.apiToken, settings.algodClient.server, settings.algodClient.port)

		const appId = 2671848

		vaultManager = new vault.VaultManager(algodClient, appId)
	} else {
		return algodClient
	}

	return algodClient
}

async function main () {
	try {
		recoverManagerAccount()

		// const appId = await vaultManager.createApp(managerAccount)
		// console.log('AppId: ' + appId)

		// await vaultManager.optIn(account4)
		//await vaultManager.updateApp (vaultAdmin)

		// await vaultManager.setMintAccount(vaultAdmin, account1.addr)
		// await vaultManager.setMintAccount(vaultAdmin, 'ZYI7YTWEXF6FGMRDOJNAGIID5M7OKO554TJOVU2RCA7Z2QWQEBTGDOLOU4')
		await vaultManager.setGlobalStatus(vaultAdmin, 1)
		
		try {
			await vaultManager.clearApp(account2)
		} catch (err) {
			console.log('Register successfully failed')
		}
		await vaultManager.optIn(account2)
		await vaultManager.setGlobalStatus(vaultAdmin, 0)

		// it should fail
		try {
			await vaultManager.registerVault(account2)
		} catch (err) {
			console.log('Register successfully failed')
		}

		await vaultManager.setGlobalStatus(vaultAdmin, 1)
		await vaultManager.registerVault(account2)

		await vaultManager.readGlobalState(vaultAdmin.addr)
		await vaultManager.readLocalState(vaultAdmin.addr)
		await vaultManager.readLocalState(account1.addr)
		await vaultManager.readLocalState(account2.addr)
		await vaultManager.readLocalState(account3.addr)
		await vaultManager.readLocalState(account4.addr)
		await vaultManager.readLocalState(account5.addr)
	} catch (err) {
		let text = err.error

		if (err.text) {
			text = err.text
		}
		else if (err.message) {
			text = err.message
		}

		throw new Error('ERROR: ' + text)
	}

	// ASA ID Testnet: 11870752
	// let tx = await asaTools.createASA(algodClient, managerAccount, 9007199254740991, 6);
}

setupClient()
main()

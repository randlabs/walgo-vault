const algosdk = require('algosdk')
const asaTools = require('./asa-tools')

let algodClient

function recoverManagerAccount () {
  // Private key mnemonic: town memory type rapid ugly aim yard moon rocket lobster survey series mesh plate great seed company vote debris limb view motion label absorb swear

  // WALBWVI43IKS7YJJADD7WGE4C4TS3OTOJOEAVEWNXEJS6CXH7OJIVKKHME
  const passphrase = 'clay vast only enact sibling axis seven around drip cruise era alcohol police web planet increase winter exclude rain pyramid art alert tool absent pave'
  const myAccount = algosdk.mnemonicToSecretKey(passphrase)
  return myAccount
}

async function setupClient () {
  if (algodClient == null) {
    const token = {
    }

    const server = 'https://api.testnet.algoexplorer.io'
    const port = ''
    algodClient = new algosdk.Algod(token, server, port)
  } else {
    return algodClient
  }

  return algodClient
}

async function main () {
  const managerAccount = recoverManagerAccount()

  // ASA ID Testnet: 11870752
  // let tx = await asaTools.createASA(algodClient, managerAccount, 9007199254740991, 6);
}

setupClient()
main()

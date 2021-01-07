# StakerDAO Vault Deployment Tools

## Create Transactions

In this section I explain how to create each type of transaction and store it in a transaction file, which is then signed and broadcasted to the blockchain.

### Modifiers

* --first-round: Especify when the transaction starts to be valid. By default, current round
* --net: mainnet/testnet/betanet. Default: testnet

### Create wALGO

#### Parameters

* Total Supply (e.g.: 1500000000000000)
* Decimals (e.g.: 6)

#### Command Line

```bash
node deploy-vault.js create-walgo 1500000000000000 6 --from account1 ... --from accountN --multisig-threshold X -out create-walgo.tx
```

### Delete wALGO

#### Parameters

* asset-id

#### Command Line

```bash
node deploy-vault.js delete-asset asset-id --from account1 ... --from accountN --multisig-threshold X -out delete-walgo.tx
```

### Create App

#### Parameters

* asset-id: ASA id of wALGO

#### Command Line

```bash
node deploy-vault.js create-app asset-id --from account1 ... --from accountN --multisig-threshold X -out create-app.tx
```

### Delete App

#### Parameters

* app-id: ASA id of wALGO

#### Command Line

```bash
node deploy-vault.js delete-app app-id --from account1 ... --from accountN --multisig-threshold X -out delete-app.tx
```

### Initialize App

#### Parameters

* wALGO-id: wALGO ASA id
* app-id: wALGO Vault application id returned on create-app

#### Command Line

```bash
node deploy-vault.js init-app wALGO-id app-id --from account1 ... --from accountN --multisig-threshold X -out init-app.tx
```
### Delegate Minter

Create a signed TEAL program that is used to mint wALGOs in the atomic transfers. The minter account must be singlesig and the signature is asked during the process or especified as parameter.
The signed TEAL is stored on the file especified with --out.

#### Parameters

* wALGO-id: wALGO ASA id
* app-id: wALGO Vault application id returned on create-app

#### Command Line

```bash
node deploy-vault.js delegate-minter wALGO-id app-id --from minterAccount -out delegate.sig
```

### Set Minter

#### Parameters

* app-id: wALGO Vault application id returned on create-app
* minter-address: new minter account

#### Command Line

```bash
node deploy-vault.js set-minter app-id minter-address --from account1 ... --from accountN --multisig-threshold X -out set-minter.tx
```

## Signing Process

### Normal account

```bash
node deploy-vault.js create-walgo 1500000000000000 6 --from account1 ... --from accountN --multisig-threshold X -out create-walgo.tx
```

## Multisig account

Each --from means that the account participates of the multisig and the --multisig-threshold especifies the amount of required signatures to validate a transaction.

* Generate the tx file that you want to send, in this example it creates a tx to create wALGO token:
```bash
node deploy-vault.js create-walgo 1500000000000000 6 --from account1 ... --from accountN --multisig-threshold X -out create-walgo.tx
```
* Sign the tx with account1 and repeat the process until the number of signatures reach the threshold X:
```bash
node deploy-vault.js --sign-txs --from account1 ... --from accountN --multisig-threshold X -in create-walgo.tx -out create-walgo-signed.tx
```
```bash
node deploy-vault.js --from account1 ... --from accountN --multisig-threshold X -in create-walgo-signed.tx -out create-walgo-signed.tx
```
...

## Send Signed Transaction/s

* Send the tx:
```bash
node deploy-vault.js --send-txs -in tx-signed.tx -out
```

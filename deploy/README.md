# StakerDAO Vault Deployment Tools

IMPORTANT: This tool assumes that the operator is on the home of the project, not on this directory.

## Create Transactions

In this section I explain how to create each type of transaction and store it in a transaction file, which is then signed and broadcasted to the blockchain.

### Modifiers

* --first-round: Especify when the transaction starts to be valid. It is not supported on user operations. By default, current round.
* --net: mainnet/testnet/betanet. Default: testnet.

### Create wALGO

#### Parameters

* Total Supply (e.g.: 1500000000000000)
* Decimals (e.g.: 6)

#### Command Line

```bash
node deploy/deploy-vault.js create-walgo 1500000000000000 6 --from account1 ... --from accountN --threshold X -out create-walgo.tx
```

### Delete wALGO

#### Parameters

* asset-id

#### Command Line

```bash
node deploy/deploy-vault.js delete-asset asset-id --from account1 ... --from accountN --threshold X -out delete-walgo.tx
```

### Create App

#### Parameters

* asset-id: ASA id of wALGO

#### Command Line

```bash
node deploy/deploy-vault.js create-app asset-id --from account1 ... --from accountN --threshold X -out create-app.tx
```

### Delete App

#### Parameters

* app-id: ASA id of wALGO

#### Command Line

```bash
node deploy/deploy-vault.js delete-app app-id --from account1 ... --from accountN --threshold X -out delete-app.tx
```

### Initialize App

#### Parameters

* wALGO-id: wALGO ASA id
* app-id: wALGO Vault application id returned on create-app

#### Command Line

```bash
node deploy/deploy-vault.js init-app wALGO-id app-id --from account1 ... --from accountN --threshold X -out init-app.tx
```
### Delegate Minter

Create a signed TEAL program that is used to mint wALGOs in the atomic transfers. The minter account must be singlesig and the signature is asked during the process or especified as parameter.
The signed TEAL is stored on the file especified with --out.

#### Parameters

* wALGO-id: wALGO ASA id
* app-id: wALGO Vault application id returned on create-app

#### Command Line

```bash
node deploy/deploy-vault.js delegate-minter wALGO-id app-id --from minterAccount -out delegate.sig
```

### Set Minter

#### Parameters

* app-id: application id returned on create-app
* minter-address: new minter account

#### Command Line

```bash
node deploy/deploy-vault.js set-minter app-id minter-address --from account1 ... --from accountN --threshold X -out set-minter.tx
```

### Set Mint Fee

#### Parameters

* app-id: application id returned on create-app
* new-fee: new mint fee 0-5000 (0%-50%)

#### Command Line

```bash
node deploy/deploy-vault.js set-mint-fee app-id new-fee --from account1 ... --from accountN --threshold X -out set-mint-fee.tx
```

### Set Burn Fee

#### Parameters

* app-id: application id returned on create-app
* new-fee: new burn fee 0-5000 (0%-50%)

#### Command Line

```bash
node deploy/deploy-vault.js set-burn-fee app-id new-fee --from account1 ... --from accountN --threshold X -out set-burn-fee.tx
```

### Set Creation Fee

#### Parameters

* app-id: application id returned on create-app
* new-fee: new creation fee in microALGOs

#### Command Line

```bash
node deploy/deploy-vault.js set-creation-fee app-id new-fee --from account1 ... --from accountN --threshold X -out set-creation-fee.tx
```

## Signing Process

### Normal account

```bash
node deploy/deploy-vault.js create-walgo 1500000000000000 6 --from account1 ... --from accountN --threshold X -out create-walgo.tx
```

## Multisig account

Each --from means that the account participates of the multisig and the --threshold especifies the amount of required signatures to validate a transaction.

* Generate the tx file that you want to send, in this example it creates a tx to create wALGO token:
```bash
node deploy/deploy-vault.js create-walgo 1500000000000000 6 --from account1 ... --from accountN --threshold X -out create-walgo.tx
```
* Sign the tx with account1 and repeat the process until the number of signatures reach the threshold X:
```bash
node deploy/deploy-vault.js --sign --from account1 ... --from accountN --threshold X -in create-walgo.tx -out create-walgo-signed.tx
```
```bash
node deploy/deploy-vault.js --from account1 ... --from accountN --threshold X -in create-walgo-signed.tx -out create-walgo-signed.tx
```
...

## Send Signed Transaction/s

* Send the tx:
```bash
node deploy/deploy-vault.js --send -in tx-signed.tx
```

## Deployment Example With Multisig on Testnet

### Create wALGO

```bash
$ node deploy/deploy-vault.js create-walgo 1500000000000000 6 --first-round +500 --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --threshold 2 --out create-walgo.tx
Transaction/s successfully saved to file create-walgo.tx

$ node deploy/deploy-vault.js --sign --in create-walgo.tx --out create-walgo-signed.tx --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --threshold 2 
Enter mnemonic for multisig KDCS27BLVWZVZ5O5T6PG3B4MCH56NUNL45Z6EZ5254MCNQO3H3KKVK7P2E:

Transaction/s successfully saved to file create-walgo-signed.tx

$ node deploy/deploy-vault.js --sign --in create-walgo-signed.tx --out create-walgo-signed.tx --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --threshold 2 
Enter mnemonic for multisig KDCS27BLVWZVZ5O5T6PG3B4MCH56NUNL45Z6EZ5254MCNQO3H3KKVK7P2E:

Transaction/s successfully saved to file create-walgo-signed.tx

$ node deploy/deploy-vault.js --send --in create-walgo-signed.tx
Sent tx: U7523AOV66BVACRLRBCSH4DKX66PQ3FZY5GUXBDEBGZIT4WH46OQ
wALGO created successfully! Asset Id: 13350236
```

### Create App

```bash
$ node deploy/deploy-vault.js create-app --first-round +5 --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --threshold 2 --out create-app.tx
Transaction/s successfully saved to file create-app.tx

$ node deploy/deploy-vault.js --sign --in create-app.tx --out create-app-signed.tx --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --threshold 2 
Enter mnemonic for multisig KDCS27BLVWZVZ5O5T6PG3B4MCH56NUNL45Z6EZ5254MCNQO3H3KKVK7P2E:

Transaction/s successfully saved to file create-app-signed.tx

$ node deploy/deploy-vault.js --sign --in create-app-signed.tx --out create-app-signed.tx --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --threshold 2 
Enter mnemonic for multisig KDCS27BLVWZVZ5O5T6PG3B4MCH56NUNL45Z6EZ5254MCNQO3H3KKVK7P2E:

Transaction/s successfully saved to file create-app-signed.tx

$ node deploy/deploy-vault.js --send --in create-app-signed.tx
Sent tx: 2Q6XS6FPNKF4TPQUCZEN27BKEHP6G6BN77LN5F3GWMP424TELEEA
Application created successfully! Application Id: 13350299
```

### Initialize App

Use wALGO-id and app-id returned on the above calls: 13350236 13350299.

```bash
$ node deploy/deploy-vault.js init-app 13350236 13350299 --first-round +5 --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --threshold 2 --out init-app.tx
Transaction/s successfully saved to file create-app.tx

$ node deploy/deploy-vault.js --sign --in init-app.tx --out init-app-signed.tx --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --threshold 2 
Enter mnemonic for multisig KDCS27BLVWZVZ5O5T6PG3B4MCH56NUNL45Z6EZ5254MCNQO3H3KKVK7P2E:

Transaction/s successfully saved to file init-app-signed.tx

$ node deploy/deploy-vault.js --sign --in init-app-signed.tx --out init-app-signed.tx --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --threshold 2 
Enter mnemonic for multisig KDCS27BLVWZVZ5O5T6PG3B4MCH56NUNL45Z6EZ5254MCNQO3H3KKVK7P2E:

Transaction/s successfully saved to file init-app-signed.tx

$ node deploy/deploy-vault.js --send --in init-app-signed.tx
Sent tx: ZSMTGTFGSVS25JHA3GQBOFBK64Z4P52MHGRGGZT5YERMCCHO4E5Q
Sent tx: MBZJ567G6UJ3TWDHCHDYDBVIJSISJ6KKCK6G72IML2UB25NLSOUQ

```

### Set Minter Account

I will use the same accounts to define a new multisig just changing the order of the acounts. To get the address of the new multisig:
```bash
node deploy/deploy-vault.js get-multisig-addr --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --threshold 2
Mulsig address: G2POAIU4E2QDLAJA4OLMZEW23PXNKPIF3RPQ7IPRYWVM2SV3IUKG27COP4
```

Use app-id returned on the create-app call: 13350299.

```bash
$ node deploy/deploy-vault.js set-minter 13350299 G2POAIU4E2QDLAJA4OLMZEW23PXNKPIF3RPQ7IPRYWVM2SV3IUKG27COP4 --first-round +5 --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --threshold 2 --out set-minter.tx
Transaction/s successfully saved to file set-minter.tx

$ node deploy/deploy-vault.js --sign --in set-minter.tx --out set-minter-signed.tx --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --threshold 2 
Enter mnemonic for multisig KDCS27BLVWZVZ5O5T6PG3B4MCH56NUNL45Z6EZ5254MCNQO3H3KKVK7P2E:

Transaction/s successfully saved to file set-minter-signed.tx

$ node deploy/deploy-vault.js --sign --in set-minter-signed.tx --out set-minter-signed.tx --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --threshold 2 
Enter mnemonic for multisig KDCS27BLVWZVZ5O5T6PG3B4MCH56NUNL45Z6EZ5254MCNQO3H3KKVK7P2E:

Transaction/s successfully saved to file set-minter-signed.tx

$ node deploy/deploy-vault.js --send --in set-minter-signed.tx
Sent tx: L35XHMXO3VRAXF5FFW22DCWDGPJEKNHR2WYDDK2HHGELLXBFLQUA

```

### Delegate Minter Account With Multisig

Use wALGO-id and app-id returned on the above calls: 13350236 13350299.

```bash
$ node deploy/deploy-vault.js delegate-minter 13350236 13350299 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --threshold 2 --out delegate-minter.lsig
Minter delegation TEAL signed in file delegate-minter.sig

$ node deploy/deploy-vault.js --sign --in delegate-minter.lsig --out delegate-minter-signed.lsig --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --threshold 2 
Enter mnemonic for multisig KDCS27BLVWZVZ5O5T6PG3B4MCH56NUNL45Z6EZ5254MCNQO3H3KKVK7P2E:

Transaction/s successfully saved to file set-minter-signed.tx

$ node deploy/deploy-vault.js --sign --in delegate-minter-signed.lsig --out delegate-minter-signed.lsig --from IIR4FNX5FI73UT5AXG3NESRSCPAHCIN2B6C32M2GJR2VDRAQJP3MKVE2K4 --from EA74IW6WLQ7MOHOYTKIW53JKHL7GQEDFQY67SNFQ2EATMAXOC2AWMR7ND4 --from 5OQISDCP3TNZFSXL6E2A3HFAIQHNYI37C2Y3C45SGYWSC4IYZZYQE2YMUU --threshold 2 
Enter mnemonic for multisig KDCS27BLVWZVZ5O5T6PG3B4MCH56NUNL45Z6EZ5254MCNQO3H3KKVK7P2E:

Transaction/s successfully saved to file set-minter-signed.tx

```

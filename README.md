# StakerDAO Vault

## Test Instructions

```bash
git clone git@github.com:randlabs/stakerdao-vault.git
cd stakerdao-vault
npm install
node test.js
```

## Command Line Tool

node vault-cli.js to get the command line options

Command Line usage example:
```bash
./test-cli.sh
```

## Vault

Accounts can create a Vault and store their ALGOs their and receive participation rewards. They can mint wALGOs up to the balance of the ALGOs in the Vault and withdraw the ALGOs at any time keeping ALGO balance above the amount of wALGOs minted.

Global Variables:
* A (Admin): admin of the Application
* GS (GlobalStatus): 1 if the Application is enabled and 0 if it is not
* MA (MintAccount): account storing the wALGOs. This account must give access to the Application to send the wALGOs to the Vault owner accounts
* MF (MintFee): fee paid in ALGOs for each mintwALGOs operation
* BF (BurnFee): fee paid in ALGOs on each burnwALGO operation
* CF (CreationFee): fee paid in ALGOs on each burnwALGO operation

Local variables stored in the Vault owner accounts:
* s (status): 1 if the Vault is enabled and 0 if it is not
* m (minted): net amount of wALGOs minted
* v (vault): Vault account corresponding to Vault owner account. This address is calculated from vault.teal specialized with the Vault owner account

Remarks:
* Only 1 Vault per account is allowed
* Minimum Withdrawal: 1000 micro Algos
* Mint & Burn Fee: if it is changed, only future mint operations are impacted

## Application Calls

### Admin setGlobalStatus

The admin can enable or disable any vault at any time.

* Tx0: 
  * Sender: Admin
  * arg0: integer: new status (0 or 1)
  * Application Call tx

### Admin setAccountStatus

The Admin can enable or disable any vault at any time.

* Tx0: 
  * Sender: Admin
  * acc0: User Address
  * arg0: integer: new status (0 or 1)
  * Application Call tx

### Admin setMintFee

Set the percent of paid in ALGOs on each mintwALGOs operation

* Tx0: 
  * Sender: Admin
  * arg0: integer: new fee (0 to 5000 which means 0%-50%)
  * Application Call tx

### Admin setBurnFee

Set the percent of ALGOs reserved for the Admin on each burnwALGOs operation

* Tx0: 
  * Sender: Admin
  * arg0: integer: new fee (0 to 5000 which means 0%-50%)
  * Application Call tx

### Admin setCreationFee

Set the fee in ALGOs that is required to send to Admin to optin to the App

* Tx0: 
  * Sender: Admin
  * arg0: integer: new fee in microALGOs
  * Application Call tx

### User optIn

User opts in to the Vault App. The App creates the local data for the account. Vault balance must be 0. If the user calls ClearState with some Vault balance and minted wALGOs, then he could use the balance and avoid returning the wALGOs. So, we need to punish anyone calling ClearState without using CloseOut.

* Tx0: from Vault owner account
  * Sender: Vault owner account
  * acc0: Vault address
  * Application Call tx

* Tx1: pay CreationFee if it is different to 0. If the fee is 0, this tx is not necessary.
  * Sender: any
  * Receiver: Admin
  * Amount: CreationFee
  * Payment tx

### User closeOut

Closes the Vault, recover the ALGOs and pay pending fees. After this operation, the user must open the Vault again.

* Tx0:
  * Sender: Vault owner account
  * acc0: Vault address
  * Application Call tx

* Tx1: 
  * Sender: Vault account
  * Receiver: any
  * Amount: any
  * CloseRemainderTo: any
  * Fee: MinTxnFee
  * Payment tx

### User depositALGOs

User sends ALGOs to the Vault address directly from any account.

### User withdrawALGOs

* Tx0: 
  * Sender: Vault owner
  * arg0: str:wA
  * acc0: Vault address
  * Application Call tx

* Tx1: 
  * Sender: Vault account
  * Receiver: any account. The remaining Vault balance must be greater than the amount of wALGOs minted less the pending fees and 2 tx cost (one for this tx and one for the CloseOut)
  * Fee: MinTxnFee
  * Amount: amount of ALGOs to withdraw
  * CloseRemainderTo: ZeroAddress
  * Payment tx

### User mintwALGOs

* Tx0: 
  * Sender: Vault owner account
  * arg0: str:mw
  * acc0: Vault address
  * Application Call tx

* Tx1: 
  * Sender: Mint account
  * AssetReceiver: any account
  * Fee: MinTxnFee
  * AssetAmount: mint amount. The total minted amount must be less or equal to the ALGO Vault balance substracted the fees and it will need to keep at least the price of an additional tx to closeOut.
  * AssetCloseTo: ZeroAddress
  * XferAsset: 2671688 (betanet)
  * AssetTransfer tx

If MintFee > 0, a third tx is needed
* Tx2: 
	* Sender: any
	* Receiver: Admin
	* Amount: Tx1.AssetAmount * MintFee / 10000
  * CloseRemainderTo: ZeroAddress
  * Payment tx

### User burnwALGOs

* Tx0: 
  * Sender: Vault owner
  * arg0: str:bw
  * Application Call tx

* Tx1: 
  * Sender: any account
  * AssetReceiver: Mint account
  * AssetAmount: burn amount. The total burned amount must be less or equal to total minted. It should be equal to arg1 Tx0
  * XferAsset: 2671688 (betanet)
  * AssetTransfer tx

If BurnFee > 0, a third tx is needed
* Tx2: 
	* Sender: any
	* Receiver: Admin
	* Amount: Tx1.AssetAmount * BurnFee / 10000
  * CloseRemainderTo: ZeroAddress
  * Payment tx

## Run Test

* settings.js contains pre-created accounts for betanet
* The App is also pre-created because the TEAL code contains a reference to the App Id that can not be automized.

```bash
node test
```

## Change vault.teal

Chaging the vault.teal requires to adjust the code in app-vault.teal that verifies the Vault code:
* Copy new vault.teal to the the content of var vaultTEAL in vault.js
* Compile the code specialized in 2 different addresses and keep the base64 code of each compilation.
	* 4YDUBDLNMVD4SBNKZBVUE6B3KA5BWMRNKAD4SWZZAWNMOCC2S4ZDKRTC24: **AiACoNejAQAmASDmB0CNbWVHyQWqyGtCeDtQOhsyLVAHyVs5BZrHCFqXMihIMwAYIhIxFiMTEDcAHAExABIQMSAyAxIQ**
	* W3UV5O2VTJYC4J6DYESAAA6QNHQYDHULEOEXOFELAT7FEHT7SS3NMBKW2Q: **AiACoNejAQAmASC26V67VZpwLifDwSQAA9Bp4YGeiyOJdxSLBP5SHn+UtihIMwAYIhIxFiMTEDcAHAExABIQMSAyAxIQ**
* [Convert the base64 to Hex](https://base64.guru/converter/decode/hex)
	* **022002a0d7a30100260120**e607408d6d6547c905aac86b42783b503a1b322d5007c95b39059ac7085a9732**28483300182212311623131037001c0131001210312032031210**
	* **022002a0d7a30100260120**b6e95ebb559a702e27c3c1240003d069e1819e8b238977148b04fe521e7f94b6**28483300182212311623131037001c0131001210312032031210**
* Identify the part at the beginning and at the end that are exactly the same in both bytestreams:
	* First part: **022002a0d7a30100260120**
	* Last part: **28483300182212311623131037001c0131001210312032031210**
* [Convert them again to base64](https://base64.guru/converter/encode/hex):
	* First part: **AiACoNejAQAmASA=**
	* Last part: **KEgzABgiEjEWIxMQNwAcATEAEhAxIDIDEhA=**
* Use these base64 strings in app-vault.teal code replacing previous Prefix and Suffix 


# staker-dao-vault

## Vault

1 Vault per user implemented as an Algorand Application
Local variables are used to track all user information:
* wALGOs withdrawed 
* Account frozen

## Transaction Types

### Admin SetAccountStatus

The administrator can enable or disable any vault at any time.
* Tx1: 
Sender: admin
acc0: User Address
arg0: new status



### User Optin

* Tx1: from Vault owner account. Parameter: Vault address

### User Closeout


### User Register

* Tx1: Register vault address using the user account. It verifies that the Vault address corresponds to the TEAL generated for the user account. 
If the vault was already registered it throws an error.
Sender: user registering Vault 
arg0: str:register

acc0 = vault address

TESTME

### User Deposit

User deposits ALGOs to the Vault. App keeps track of the amount of algos deposited without rewards.

* Tx1: 
Sender: Vault owner
arg0 = str:deposit-algos

acc0 = vault address

* Tx2: 
To: Vault address
Amount: deposit amount


TODO:
Closeout: ensures that the user can't call it if there are deposits

### User Withdraw ALGOs

### User Mint wALGOs

* Tx1: 

Sender: Vault owner
arg0 = str:mint-walgos
arg1 = int:amount
txn TypeEnum 6

* Tx2: 
txn TypeEnum 4
AssetSender: Mint Account
AssetReceiver: Vault owner 
Fee: MinTxnFee
AssetAmount: mint amount. The total minted amount must be less or equal to the ALGO Vault balance
AssetCloseTo: ZeroAddress
XferAsset: 2671688 (betanet)


### User Burn wALGOs

User creates a vault
User deposits the Algos 
User withdraw wAlgos


## Setup Parameters ##

mint-account
manager
global-status
status
Fee: mint a % of wALGOs for the manager
# StakerDAO Vault

## Vault

1 Vault per user implemented as an Algorand Application
Local variables are used to track all user information:
* wALGOs withdrawed 
* Account frozen

## Application Calls

### RegisterVault

* Tx1: Register vault address using the user account. It verifies that the Vault address corresponds to the TEAL generated for the user account. 
If the vault was already registered it throws an error.

Sender: user registering Vault 

arg0: str:register

acc0: Vault address


### Admin SetAccountStatus

The administrator can enable or disable any vault at any time.

* Tx1: 

Sender: admin

acc0: User Address

arg0: new status


### User Optin

* Tx1: from Vault owner account. 

### User Closeout

TODO:

Ensures that the user can't call it if there are deposits

### User Deposit

User deposits ALGOs to the Vault. App keeps track of the amount of algos deposited without rewards.

* Tx1: 

Sender: Vault owner

arg0: str:deposit-algos

arg1: int:amount

acc0: Vault address

Application Call tx

* Tx2: 

To: Vault address

Amount: deposit amount equal to arg1 Tx1

Payment tx


### User Mint wALGOs

* Tx1: 

Sender: Vault owner

arg0: str:mint-walgos

arg1: int:amount

Application Call tx

* Tx2: 

Sender: Mint Account

AssetReceiver: Vault owner 

Fee: MinTxnFee

AssetAmount: mint amount. The total minted amount must be less or equal to the ALGO Vault balance

AssetCloseTo: ZeroAddress

XferAsset: 2671688 (betanet)

AssetTransfer tx

### User Withdraw ALGOs

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
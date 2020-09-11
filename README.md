# StakerDAO Vault

## Vault

Accounts can create a Vault and store their ALGOs their and receive participation rewards. They can mint wALGOs up to the balance of the ALGOs in the Vault and withdraw the ALGOs at any time keeping ALGO balance above the amount of wALGOs minted.

Global Variables:
* Creator: creator and manager of the Application
* GlobalStatus: 1 if the Application is enabled and 0 if it is not
* MintAccount: account storing the wALGOs. This account must give access to the Application to send the wALGOs to the Vault owner accounts

Remarks:
Only 1 Vault per account is allowed. 

Local variables stored in the Vault owner accounts:
* status: 1 if the Vault is enabled and 0 if it is not
* minted: amount of wALGOs minted
* deposits: amount of ALGOs deposited without taking into account the participation rewards
* vault: Vault account corresponding to Vault owner account. This address is calculated from vault.teal specialized with the Vault owner account

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

* Tx1: from Vault owner account

### User Closeout

TODO:

Ensures that the user can't call it if there are deposits

### User Deposit

User deposits ALGOs to the Vault. App keeps track of the amount of algos deposited without rewards.

* Tx1: 

Sender: Vault owner account

arg0: str:deposit-algos

arg1: int:amount

Application Call tx

* Tx2: 

To: Vault account

Amount: deposit amount. It should be equal to arg1 Tx1

Payment tx

### User Mint wALGOs

* Tx1: 

Sender: Vault owner account

arg0: str:mint-walgos

arg1: int:amount

acc0: Vault address

Application Call tx

* Tx2: 

Sender: Mint account

AssetReceiver: any account

Fee: MinTxnFee

AssetAmount: mint amount. The total minted amount must be less or equal to the ALGO Vault balance. It should be equal to arg1 Tx1

AssetCloseTo: ZeroAddress

XferAsset: 2671688 (betanet)

AssetTransfer tx

### User Withdraw ALGOs

* Tx1: 

Sender: Vault account owner

arg0: str:withdraw-algos

arg1: int:amount

Application Call tx

* Tx2: 

Sender: Vault account

Receiver: any account. The remaining balance must be greater than the amount of wALGOs minted

Fee: MinTxnFee

Amount: amount of ALGOs to withdraw, it should be equal to arg1 Tx1

CloseTo: ZeroAddress

Payment tx

### User Burn wALGOs

* Tx1: 

Sender: Vault owner account

arg0: str:burn-walgos

arg1: int:amount

Application Call tx

* Tx2: 

Sender: any account

AssetReceiver: Mint account

AssetAmount: burn amount. The total burned amount must be less or equal to total minted. It should be equal to arg1 Tx1

XferAsset: 2671688 (betanet)

AssetTransfer tx



## Setup Parameters ##

mint-account

manager

global-status

status

Fee: mint a % of wALGOs for the manager

## TODO

* Mint fee
* Rewards fee
* Fees withdraw
* Clean Closeout: it should allow users to closeout only after burning all the minted wALGOs and withdraw all the ALGOs from the Vault
* Implement app-vault-opt-out.teal
* Clean Application Delete: allow Application delete only if all the Vaults were closed before
* Javascript version of the interaction
* Develop minter.teal to allow only Vaults mint wALGOs
* Automate vault-xxx.teal creation

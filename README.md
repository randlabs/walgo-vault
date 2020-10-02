# StakerDAO Vault

## Vault

Accounts can create a Vault and store their ALGOs their and receive participation rewards. They can mint wALGOs up to the balance of the ALGOs in the Vault and withdraw the ALGOs at any time keeping ALGO balance above the amount of wALGOs minted.

Global Variables:
* A (Admin): admin of the Application
* GS (GlobalStatus): 1 if the Application is enabled and 0 if it is not
* MA (MintAccount): account storing the wALGOs. This account must give access to the Application to send the wALGOs to the Vault owner accounts
* MF (MintFee): fee paid in ALGOs for each mintwALGOs operation
* DF (DepositFee): fee paid in ALGOs on each ALGO deposit
* MFa (Mint Fees accumulated): wALGOs accumulated for the Admin collected in Mint Fees
* WFa (Withdrawal Fees accumulated): ALGOs accumulated for the Admin collected in Mint Fees

Remarks:
Only 1 Vault per account is allowed
Minimum Withdrawal: 1000 micro Algos
Rewards Fee: if it is changed, the rewards already got will be impacted
Mint Fee: if it is changed, only future mint operations are impacted

Local variables stored in the Vault owner accounts:
* s (status): 1 if the Vault is enabled and 0 if it is not
* m (minted): amount of wALGOs minted
* d (deposits): total amount of ALGOs deposited 
* v (vault): Vault account corresponding to Vault owner account. This address is calculated from vault.teal specialized with the Vault owner account
* w (withdrawals): total amount of ALGOs withdrew
* wrf (withdrew rewards fees): rewards fees already withdrew by the App Owner
* rf (rewards fees): debug variable to verify rewards fee calculation. It is set on the withdrawALGOs operation

## Application Calls

### Admin setGlobalStatus

The admin can enable or disable any vault at any time.

* Tx1: 

Sender: Admin

arg0: integer: new status (0 or 1)

### Admin setAccountStatus

The Admin can enable or disable any vault at any time.

* Tx1: 

Sender: Admin

acc0: User Address

arg0: integer: new status (0 or 1)

### Admin setMintFee

Set the percent of wALGOs minted for the Vault owner when the user calls mintwALGOs

* Tx1: 

Sender: Admin

arg0: integer: new fee (0 to 5000 which means 0%-50%)

### Admin setRewardsFee

Set the percent of ALGOs reserved for the Admin from the participation rewards earned by the Vault

* Tx1: 

Sender: Admin

arg0: integer: new fee (0 to 5000 which means 0%-50%)

### User optIn

User opts in to the Vault App. The App creates the local data for the account.

* Tx1: from Vault owner account

### User closeOut

Ensures that the user can't call it if there are deposits

* Tx1:

Sender: Vault owner account

arg0: str:dA

arg1: int:amount

Application Call tx

* Tx2: 

Sender: Vault account

Receiver: any account. The remaining balance must be greater than the amount of wALGOs minted

Fee: MinTxnFee

Amount: amount of ALGOs to withdraw, it should be equal to arg1 Tx1

CloseTo: Admin account

Payment tx


### User depositALGOs

User deposits ALGOs to the Vault. App keeps track of the amount of algos deposited without rewards.

* Tx1: 

Sender: Vault owner account

arg0: str:dA

arg1: int:amount

Application Call tx

* Tx2: 

To: Vault account

Amount: deposit amount. It should be equal to arg1 Tx1

Payment tx

### User mintwALGOs

* Tx1: 

Sender: Vault owner account

arg0: str:mw

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

### User withdrawALGOs

* Tx1: 

Sender: Vault owner

arg0: str:wA

arg1: int:amount

Application Call tx

* Tx2: 

Sender: Vault account

Receiver: any account. The remaining balance must be greater than the amount of wALGOs minted

Fee: MinTxnFee

Amount: amount of ALGOs to withdraw, it should be equal to arg1 Tx1

CloseTo: ZeroAddress

Payment tx

### User burnwALGOs

* Tx1: 

Sender: Vault owner

arg0: str:bw

arg1: int:amount

Application Call tx

* Tx2: 

Sender: any account

AssetReceiver: Mint account

AssetAmount: burn amount. The total burned amount must be less or equal to total minted. It should be equal to arg1 Tx1

XferAsset: 2671688 (betanet)

AssetTransfer tx



## TODO

* Mint fee
* Rewards fee
* Fees withdraw
* Clean Closeout: it should allow users to closeout only after burning all the minted wALGOs and withdraw all the ALGOs from the Vault
* Implement app-vault-opt-out.teal
* Clean Application Delete: allow Application delete only if all the Vaults were closed before
* Develop minter.teal to allow only Vaults mint wALGOs
* Do not allow registration if the Vault has balance

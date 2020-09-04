# staker-dao-vault

## Vault

1 Vault per user implemented as an Algorand Application
Local variables are used to track all user information:
* wALGOs withdrawed 
* Account frozen

## Transaction Types

### Vault Creation

Pre-signed LogicSig allowing any account to add the Vault. We will generate a large number of pre-signed txs adding this Vaults. Users creating a new Vault will use one of these pre-created txs to assign the Vault to their addresses.
* Tx1: from Admin to App. Assign Vault to user address.

### User Optin

* Tx1: from Vault owner account. Parameter: Vault address

### User Register

* Tx1: Register vault address using the user account. It verifies that the Vault address corresponds to the TEAL generated for the user account.
Sender: user registering Vault 
arg0: str:register
arg1 = addr:vault address

### User Deposit

User deposits ALGOs to the Vault. App keeps track of the amount of algos deposited without rewards.

* Tx1: 
Sender: user Vault owner
arg0 = str:deposit
arg1 = addr:vault address

* Tx2: 
To: Vault address
Amount: deposit amount

### User Withdraw ALGOs


### User Withdraw wALGO


### User Deposits wALGO


### User Deposits wALGO


User creates a vault
User deposits the Algos 
User withdraw wAlgos

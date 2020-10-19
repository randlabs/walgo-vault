#!/usr/bin/env bash

#
# Admin
#
echo 'node vault-cli.js --update-app --account 0'
node vault-cli.js --update-app --account 0
# set global status disabled
echo 'node vault-cli.js --set-global-status 0 --account 0'
node vault-cli.js --set-global-status 0 --account 0
# set global status enabled
echo 'node vault-cli.js --set-global-status 1 --account 0'
node vault-cli.js --set-global-status 1 --account 0
# set mint account 7
echo 'node vault-cli.js --set-mint-account 7 --account 0'
node vault-cli.js --set-mint-account 7 --account 0
# set admin account 2
echo 'node vault-cli.js --set-admin-account 2 --account 0'
node vault-cli.js --set-admin-account 2 --account 0

res=$(node vault-cli --admin-account)
echo $res

# set admin account 0
echo 'node vault-cli.js --set-admin-account 0 --account 2'
node vault-cli.js --set-admin-account 0 --account 2

# get admin account
echo 'node vault-cli --admin-account'
res=$(node vault-cli --admin-account)
echo $res

# get mint account
echo 'node vault-cli --mint-account'
res=$(node vault-cli --mint-account)
echo $res

# get mint fee
echo 'node vault-cli --mint-fee'
res=$(node vault-cli --mint-fee)
echo $res

# get burn fee
echo 'node vault-cli --burn-fee'
res=$(node vault-cli --burn-fee)
echo $res

# get creation fee
echo 'node vault-cli --creation-fee'
res=$(node vault-cli --creation-fee)
echo $res

# get global status
res=$(node vault-cli --status)
echo $res


echo 'node vault-cli.js --vault-addr --account 1'
res=$(node vault-cli.js --vault-addr --account 1)
echo $res


#
# User
#
# optin
echo 'node vault-cli.js --optin --account 1'
node vault-cli.js --optin --account 1



# set account1 disabled
echo 'node vault-cli.js --set-account-status 1 0 --account 0'
node vault-cli.js --set-account-status 1 0 --account 0

# get account status
echo 'node vault-cli.js --account-status --account 1'
res=$(node vault-cli.js --account-status --account 1)
echo $res

# set account1 enabled
echo 'node vault-cli.js --set-account-status 1 1 --account 0'
node vault-cli.js --set-account-status 1 1 --account 0

# get account status
echo 'node vault-cli.js --account-status --account 1'
res=$(node vault-cli.js --account-status --account 1)
echo $res

# optin-asa
echo 'node vault-cli.js --optin-asa --account 1'
node vault-cli.js --optin-asa --account 1
# deposit
echo 'node vault-cli.js --deposit 2330100 --account 1'
node vault-cli.js --deposit 2330100 --account 1

echo 'node vault-cli.js --vault-balance --account 1'
res=$(node vault-cli.js --vault-balance --account 1)
echo $res

# mint
echo 'node vault-cli.js --mint 1200000 --account 1'
node vault-cli.js --mint 1200000 --account 1

echo 'node vault-cli.js --minted --account 1'
res=$(node vault-cli.js --minted --account 1)
echo $res

echo 'node vault-cli.js --admin-fees --account 1'
res=$(node vault-cli.js --admin-fees --account 1)
echo $res

# burn
echo 'node vault-cli.js --burn 550000 --account 1'
node vault-cli.js --burn 550000 --account 1

echo 'node vault-cli.js --minted --account 1'
res=$(node vault-cli.js --minted --account 1)
echo $res

echo 'node vault-cli.js --admin-fees --account 1'
res=$(node vault-cli.js --admin-fees --account 1)
echo $res

# burn
echo 'node vault-cli.js --burn 650000 --account 1'
node vault-cli.js --burn 650000 --account 1

echo 'node vault-cli.js --minted --account 1'
res=$(node vault-cli.js --minted --account 1)
echo $res

echo 'node vault-cli.js --admin-fees --account 1'
res=$(node vault-cli.js --admin-fees --account 1)
echo $res

# closeout
echo 'node vault-cli.js --closeout --account 1'
node vault-cli.js --closeout --account 1

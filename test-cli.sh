#!/usr/bin/env bash

#
# Admin
#
echo 'node vault-cli.js --update-app --from 0'
node vault-cli.js --update-app --from 0
# set global status disabled
echo 'node vault-cli.js --set-global-status 0 --from 0'
node vault-cli.js --set-global-status 0 --from 0
# set global status enabled
echo 'node vault-cli.js --set-global-status 1 --from 0'
node vault-cli.js --set-global-status 1 --from 0
# set account1 disabled
echo 'node vault-cli.js --set-account-status 1 0 --from 0'
node vault-cli.js --set-account-status 1 0 --from 0
# set account1 enabled
echo 'node vault-cli.js --set-account-status 1 1 --from 0'
node vault-cli.js --set-account-status 1 1 --from 0
# set mint account 7
echo 'node vault-cli.js --set-mint-account 7 --from 0'
node vault-cli.js --set-mint-account 7 --from 0
# set admin account 2
echo 'node vault-cli.js --set-admin-account 2 --from 0'
node vault-cli.js --set-admin-account 2 --from 0
# set admin account 0
echo 'node vault-cli.js --set-admin-account 0 --from 2'
node vault-cli.js --set-admin-account 0 --from 2

#
# User
#
# optin
echo 'node vault-cli.js --optin --from 1'
node vault-cli.js --optin --from 1
# optin-asa
echo 'node vault-cli.js --optin-asa --from 1'
node vault-cli.js --optin-asa --from 1
# deposit
echo 'node vault-cli.js --deposit 2330100 --from 1'
node vault-cli.js --deposit 2330100 --from 1
# mint
echo 'node vault-cli.js --mint 1200000 --from 1'
node vault-cli.js --mint 1200000 --from 1
# burn
echo 'node vault-cli.js --burn 550000 --from 1'
node vault-cli.js --burn 550000 --from 1
# burn
echo 'node vault-cli.js --burn 650000 --from 1'
node vault-cli.js --burn 650000 --from 1
# closeout
echo 'node vault-cli.js --closeout --from 1'
node vault-cli.js --closeout --from 1

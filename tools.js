/*************************************************************************
 *  [2018] - [2020] Rand Labs Inc.
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Rand Labs Inc.
 * The intellectual and technical concepts contained
 * herein are proprietary to Rand Labs Inc.
 */
const sha512 = require("js-sha512")
const hibase32 = require("hi-base32");

const ALGORAND_ADDRESS_SIZE = 58

function timeoutPromise(ms, promise) {
	return new Promise((resolve, reject) => {
	  const timeoutId = setTimeout(() => {
		reject(new Error("promise timeout"))
	  }, ms);
	  promise.then(
		(res) => {
		  clearTimeout(timeoutId);
		  resolve(res);
		},
		(err) => {
		  clearTimeout(timeoutId);
		  reject(err);
		}
	  );
	})
}

function getInt64Bytes( x, len ){
	if (!len) {
		len = 8;
	}
	var bytes = new Uint8Array(len);
	do {
		bytes[--len] = x & (255);
		x = x>>8;
	} while ( len )
    return bytes;
}

addressFromByteBuffer = function (addr) {
	const bytes = Buffer.from(addr, "base64")

	//compute checksum
	const checksum = sha512.sha512_256.array(bytes).slice(28, 32);

	const c = new Uint8Array(bytes.length + checksum.length);
	c.set(bytes);
	c.set(checksum, bytes.length)

	const v = hibase32.encode(c)

	return v.toString().slice(0, ALGORAND_ADDRESS_SIZE)
}

printAppCallDeltaArray = function (deltaArray) {
	for (let i = 0; i < deltaArray.length; i++) {
		if (deltaArray[i].address) {
			console.log ('Local state change address: ' + deltaArray[i].address)
			for (let j = 0; j < deltaArray[i].delta.length; j++) {
				printAppCallDelta(deltaArray[i].delta[j])
			}
		}
		else {
			console.log ('Global state change')
			printAppCallDelta(deltaArray[i])
		}
	}
}
printAppCallDelta = function(state) {
	let text = Buffer.from(state.key, 'base64').toString() + ': '
	if (state.value.bytes !== undefined) {
		let addr = this.addressFromByteBuffer (state.value.bytes)
		if (addr.length == ALGORAND_ADDRESS_SIZE) {
			text += addr
		}
		else {
			text += state.value.bytes
		}
	}
	else if (state.value.uint !== undefined) {
		text += state.value.uint
	}
	else {
		text += '0'
	}
	console.log(text)
}

printAppStateArray = function (stateArray) {
	for (let n = 0; n < stateArray.length; n++) {
		this.printAppState(stateArray[n])
	}
}

appValueState = function(stateValue) {
	let text = ''

	if (stateValue.type == 1) {
		let addr = this.addressFromByteBuffer (stateValue.bytes)
		if (addr.length == ALGORAND_ADDRESS_SIZE) {
			text += addr
		}
		else {
			text += stateValue.bytes
		}
	}
	else if (stateValue.type == 2) {
		text = stateValue.uint
	}
	else {
		text += stateValue.bytes
	}

	return text
}

appValueStateString = function(stateValue) {
	let text = ''

	if (stateValue.type == 1) {
		let addr = this.addressFromByteBuffer (stateValue.bytes)
		if (addr.length == ALGORAND_ADDRESS_SIZE) {
			text += addr
		}
		else {
			text += stateValue.bytes
		}
	}
	else if (stateValue.type == 2) {
		text += stateValue.uint
	}
	else {
		text += stateValue.bytes
	}

	return text
}

// appValueStateInt: return the integer stored or 0 otherwise
appValueStateInt = function(stateValue) {
	let text = 0

	if (stateValue.type == 2) {
		text = stateValue.uint
	}

	return text
}

printAppState = function(state) {
	let text = Buffer.from(state.key, 'base64').toString() + ': '

	text += appValueStateString(state.value)

	console.log(text)
}

printAppLocalState = async function (algodClient, appId, accountAddr) {
	let ret = await readAppLocalState(algodClient, appId, accountAddr)
	if (ret) {
			console.log("Application %d local state for account %s:", appId,  accountAddr)
			printAppStateArray(ret);
	}
}

printAppGlobalState = async function (algodClient, appId, accountAddr) {
	let ret = await readAppGlobalState(algodClient, appId, accountAddr)
	if (ret) {
			console.log("Application %d global state:", appId)
			printAppStateArray(ret);
	}
}

// read global state of application
readAppGlobalState = async function (algodClient, appId, accountAddr) {
	const accountInfoResponse = await algodClient.accountInformation(accountAddr).do()
	for (let i = 0; i < accountInfoResponse['created-apps'].length; i++) {
		if (accountInfoResponse['created-apps'][i].id === appId) {
			let globalState = accountInfoResponse['created-apps'][i].params['global-state']

			return globalState
			// this.printAppStateArray (globalState)
		}
	}
}

readAppGlobalStateByKey = async function (algodClient, appId, accountAddr, key) {
	const accountInfoResponse = await algodClient.accountInformation(accountAddr).do()
	for (let i = 0; i < accountInfoResponse['created-apps'].length; i++) {
		if (accountInfoResponse['created-apps'][i].id === appId) {
			// console.log("Application's global state:")
			let stateArray = accountInfoResponse['created-apps'][i].params['global-state']
			for (let j = 0; j < stateArray.length; j++) {
				let text = Buffer.from(stateArray[j].key, 'base64').toString()

				if(key === text) {
					return appValueState(stateArray[j].value)
				}
			}
		}
	}
}

// read local state of application from user account
readAppLocalState = async function (algodClient, appId, accountAddr) {
	const accountInfoResponse = await algodClient.accountInformation(accountAddr).do()
	for (let i = 0; i < accountInfoResponse['apps-local-state'].length; i++) {
		if (accountInfoResponse['apps-local-state'][i].id === appId) {
			// console.log(accountAddr + " opted in, local state:")

			if (accountInfoResponse['apps-local-state'][i]['key-value']) {
				// this.printAppStateArray (accountInfoResponse['apps-local-state'][i]['key-value'])
				return accountInfoResponse['apps-local-state'][i]['key-value']
			}
		}
	}
}

readAppLocalStateByKey = async function (algodClient, appId, accountAddr, key) {
	const accountInfoResponse = await algodClient.accountInformation(accountAddr).do()
	for (let i = 0; i < accountInfoResponse['apps-local-state'].length; i++) {
		if (accountInfoResponse['apps-local-state'][i].id === appId) {
			let stateArray = accountInfoResponse['apps-local-state'][i]['key-value']

			if(!stateArray) {
				return null
			}
			for (let j = 0; j < stateArray.length; j++) {
				let text = Buffer.from(stateArray[j].key, 'base64').toString()

				if(key === text) {
					return appValueState(stateArray[j].value)
				}
			}
		}
	}
}

function uintArray8ToString(byteArray) {
  return Array.from(byteArray, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('')
}

// uintArray8ToString = function(bytes) {
// 	var debugString = '';
// 	for(var i=0; i<bytes.byteLength; i++) {
// 		debugString += debugString.concat(bytes[i].toString());
// 	}
// 	return debugString
// }

module.exports = { 
	timeoutPromise, 
	getInt64Bytes,
	addressFromByteBuffer,
	printAppCallDeltaArray,
	printAppCallDelta,
	printAppStateArray,
	printAppState,
	printAppLocalState,
	printAppGlobalState,
	readAppGlobalState,
	readAppGlobalStateByKey,
	readAppLocalState,
	readAppLocalStateByKey,
	uintArray8ToString
}

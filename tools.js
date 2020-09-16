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

printAppState = function(state) {
	let text = Buffer.from(state.key, 'base64').toString() + ': '
	if (state.value.type == 1) {

		let addr = this.addressFromByteBuffer (state.value.bytes)
		if (addr.length == ALGORAND_ADDRESS_SIZE) {
			text += addr
		}
		else {
			text += state.value.bytes
		}
	}
	else if (state.value.type == 2) {
		text += state.value.uint
	}
	else {
		text += state.value.bytes
	}
	console.log(text)
}

// read global state of application
readAppGlobalState = async function (algodClient, appId, accountAddr) {
	const accountInfoResponse = await algodClient.accountInformation(accountAddr).do()
	for (let i = 0; i < accountInfoResponse['created-apps'].length; i++) {
		if (accountInfoResponse['created-apps'][i].id === appId) {
			console.log("Application's global state:")
			let globalState = accountInfoResponse['created-apps'][i].params['global-state']

			return globalState
			// this.printAppStateArray (globalState)
		}
	}
}

// read local state of application from user account
readAppLocalState = async function (algodClient, appId, accountAddr) {
	const accountInfoResponse = await algodClient.accountInformation(accountAddr).do()
	for (let i = 0; i < accountInfoResponse['apps-local-state'].length; i++) {
		if (accountInfoResponse['apps-local-state'][i].id === appId) {
			console.log(accountAddr + " opted in, local state:")

			if (accountInfoResponse['apps-local-state'][i]['key-value']) {
				// this.printAppStateArray (accountInfoResponse['apps-local-state'][i]['key-value'])
				return accountInfoResponse['apps-local-state'][i]['key-value']
			}
		}
	}
}

module.exports = { 
	timeoutPromise, 
	getInt64Bytes,
	addressFromByteBuffer,
	printAppCallDeltaArray,
	printAppCallDelta,
	printAppStateArray,
	printAppState,
	readAppGlobalState,
	readAppLocalState
}

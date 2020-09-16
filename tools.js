/*************************************************************************
 *  [2018] - [2020] Rand Labs Inc.
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Rand Labs Inc.
 * The intellectual and technical concepts contained
 * herein are proprietary to Rand Labs Inc.
 */

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

module.exports = { 
	timeoutPromise, 
	getInt64Bytes 
}

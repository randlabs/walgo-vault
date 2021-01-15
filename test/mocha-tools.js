/* eslint-disable max-len */
let expect = require("chai").expect;

function errorText(err) {
	let errObj;
	let text;
	if (err.response) {
		errObj = err.response;
	}
	else {
		errObj = err.error;
	}

	if (errObj.text) {
		if (errObj.text.message) {
			text = errObj.text.message;
		}
		else {
			text = errObj.text;
		}
	}
	else if (errObj.message) {
		text = errObj.message;
	}

	return text;
}

function expectTxId(txId) {
	// eslint-disable-next-line require-unicode-regexp
	expect(txId).to.match(/[\dA-Z]{52}/);
}

function expectTEALReject(err) {
	let text = errorText(err);
	// eslint-disable-next-line require-unicode-regexp
	expect(text).to.match(/(?:TEAL runtime encountered err opcode|would result negative|transaction rejected by ApprovalProgram|rejected by logic|below min 100000)/);
}

function expectTEALRejectNonAdminError(err) {
	let text = errorText(err);
	// eslint-disable-next-line require-unicode-regexp
	expect(text).to.match(/(?:cannot fetch state)/);
}

module.exports = {
	expectTxId,
	expectTEALReject,
	expectTEALRejectNonAdminError
};

/* eslint-disable max-len */
let expect = require("chai").expect;

function errorText(err) {
	let text = err.error;

	if (err.text) {
		if (err.text.message) {
			text = err.text.message;
		}
		else {
			text = err.text;
		}
	}
	else if (err.message) {
		text = err.message;
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

/*************************************************************************
 *  [2018] - [2020] Rand Labs Inc.
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Rand Labs Inc.
 * The intellectual and technical concepts contained
 * herein are proprietary to Rand Labs Inc.
 */

const process = require('process')
const path = require('path')

// ------------------------------------------------------------------------------

let settings = null

// ------------------------------------------------------------------------------

function get () {
	if (!settings) {
		// if settings were not loaded yet, load them

		// setup the settings filename
		let filename = 'settings'
		for (let idx = 0; idx < process.argv.length; idx++) {
			// eslint-disable-next-line security/detect-object-injection
			if (process.argv[idx] == '--settings') {
				if (idx + 1 >= process.argv.length) {
					throw new Error('ERROR: Missing filename in "--settings" parameter.')
				}
				filename = process.argv[idx + 1]
			}
		}

		try {
			filename = path.resolve(__dirname, '.', filename)

			settings = require(filename)
		} catch (err) {
			throw new Error('ERROR: Unable to load settings file.')
		}

		settings.base_dir = path.dirname(filename)
		if (!settings.base_dir.endsWith(path.sep)) {
			settings.base_dir += path.sep
		}
	}
	return settings
}

// ------------------------------------------------------------------------------

module.exports = {
	get
}

module.exports = {
	appName: 'StakerDAO Vault',

	timeout: 2500000,

	// betanet
	assetId: 2707342,
	appId: 2707377,

	//keepCreatedAsset: true,
	//keepCreatedApp: true,

	burnFee: 100,
	mintFee: 150,
	creationFee: 1568670,
	minterDelegateFile: 'minter-delegation.sig',

	algodClient: {
		//server: 'https://api.testnet.algoexplorer.io',
		server: 'https://api.betanet.algoexplorer.io',
		//server: 'localhost:8090',
		port: '',
		apiToken: {
		//	'X-Algo-API-Token': '133e2f3f4c6058f59930aed3df861948c2e85a21afa733080af2b06e668ccdf7',
		}
	},

	account0: {
		privateKey: 'injury purchase behave pool tuna error keep apart snow essence symbol notice mansion exile punch aware tent kid cinnamon vault mask talent change absorb raise',
		publicKey: 'W3UV5O2VTJYC4J6DYESAAA6QNHQYDHULEOEXOFELAT7FEHT7SS3NMBKW2Q'
	},

	account1: {
		privateKey: 'south quick valid slab defy conduct absorb captain borrow bulb drive box wall again orchard express ensure mail venue deputy negative radar violin about cousin',
		publicKey: 'M7VGND73KDBHIKB3KB7GT3PHVORFPGVOEOY6TZFA25DDVJ5WRLV7S5KQ7E'
	},
	account2: {
		privateKey: 'immune gloom foil disorder furnace bleak attack huge risk resemble phone choose minute priority shop grow jewel armor air exact real hurry arrange ability picnic',
		publicKey: 'P4QKUHU4ZWR7IVF3DXHWFC34ZLI3EZ7JWT6YCPGJ6RQNNHF5RJ2LADTSXE'
	},
	account3: {
		privateKey: 'reason rigid ranch shock portion blouse miracle barrel balcony option curious quarter possible stick true sting lake recycle nest junior horn veteran copy about alien',
		publicKey: 'DDA62FAYHSPYBSGKXQPUFNL2IG5WPMYQNPQS44YW5X4NER7ABNUOVHL4M4'
	},
	account4: {
		privateKey: 'twelve chunk clay rally balcony debris raw only library tenant auction discover error hammer economy visit frog bridge wheel slogan caution remain alone ability magnet',
		publicKey: 'XTZVAH6FPQDX2VOVHBOCTWP3YSNFK5PFFN76YLBI7HMJS7TSWLQKU6DKOA'
	},
	account5: {
		privateKey: 'track panic hollow hub clap sniff bracket animal whale mother mirror object coral same canoe pitch lyrics oven issue deputy north soft story above very',
		publicKey: 'HEBIUTQ4WVRQSK7GBNUOZSWC4XP6HLIGF2YGV4ASTPHGW7CDJ5OMMJLOIU'
	},
	account6: {
		privateKey: 'worry sphere situate rib update trumpet glove mechanic perfect glare cost cart agree drastic spin blanket what flash orient utility grow focus zebra abandon leave',
		publicKey: 'CV3U3AV6WY4Q22QLGYUQYFBF6DQWZLK23S5PBLFXRI3MWVQHVUHIE7EZB4'
	},
	minterAccount: {
		privateKey: 'sadness cradle giraffe famous garbage uniform real catalog horse swift elder trim skill shoe fault lyrics net file brown shop trophy vehicle fitness abstract orphan',
		publicKey: 'GZILFNLBQ4BURKLJISKDQVNDXOTFGMSP6MAXI76HRB2KDI2PBAA2TKFFIY'
	},
	dispenserAccount: {
		privateKey: 'off make custom code notable rule furnace zoo acid miss almost orchard add original pelican obtain open entire depend bleak rival dove outside absorb fame',
		publicKey: '5TAAKQIKHOWAGL7HQLB43LHNMOAZNKP76QBB4OWEAYQSKSVA5VS6Y6DRCQ'
	},
	clearStateAttackAccount: {
		privateKey: 'hello lesson dad camp squeeze screen ensure question concert never trash when soda wool smart genre humor verb vote insect abandon tide defense about soccer',
		publicKey: '3CMRUAF4U7P2GOGVXXEKXAUZCCVUTTQTKYEAA75CGFDG4H3L66SBPYAI3A'
	},
	
	debug: {
		// statsKey: 'some-key-to-enable'
		// printUrl: true,
	}
}

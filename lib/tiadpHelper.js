var keychain = require('keychain');
var fields = require('fields');
var _ = require('underscore');

var ACCOUNT_KEYCHAIN = "adp";
var SERVICE_KEYCHAIN = "tiadp";

var NO_KEYCHAIN_KEY_PRESENT = exports.NO_KEYCHAIN_KEY_PRESENT = 'No Apple Developer Portal credentials saved in Keychain';

var setKeychain = function(data, _callback) {
	keychain.setPassword({
		account : ACCOUNT_KEYCHAIN,
		service : SERVICE_KEYCHAIN,
		password : JSON.stringify(data)
	}, function(err, pass) {
		_callback(pass);
	});
};

var getKeychain = exports.getKeychain = function(_callback) {
	keychain.getPassword({
		account : ACCOUNT_KEYCHAIN,
		service : SERVICE_KEYCHAIN
	}, function(err, pass) {
		_callback(pass);
	});
};

exports.getDataFromTest = function() {
	pass = "";
	getKeychain(function(credentials) {
		pass = credentials;
	});
	return pass;
};

var promtToSelectYesNo = exports.promtToSelectYesNo = function(data, _success, _fail) {
	var selection = fields.select({
		title : data.message,
		promptLabel : "(y,n)",
		options : ['__y__es', '__n__o']
	}).prompt(function(err, value) {
		if (err) {
			console.log('There was an error!\n' + err);
		} else {
			if (value == 'yes') {
				_success(data, value);
			} else {
				_fail(value);
			}
		}
	});
};

var promptSelection = exports.promptSelection = function(params, options, _callback) {
	fields.select({
		title : options.title,
		formatters : options.format,
		optionValue : options.value,
		numbered : true,
		relistOnError : true,
		complete : true,
		suggest : true,
		options : {
			"options" : params
		}
	}).prompt(function(err, value) {
		if (err) {
			console.log('There was an error!\n' + err);
		} else {
			_callback(value, _callback);
		}
	});
};

exports.saveADPCredentials = function(data, _callback) {
	promtToSelectYesNo({
		"data" : data,
		"message" : "Do you want to save your Apple Developer Portal account password in Keychain?"
	}, function(data, value) {
		var data = data.data;
		setKeychain(data, function(res) {
			console.log('Credential saved successfully in keychain.');
			_callback(value);
		});
	}, function(value) {
		console.log('Credential not saved in keychain.');
		_callback(value);
	});
};

var checkDuplicateEntry = exports.checkDuplicateEntry = function(credentials, loginEntered) {
	var previousEntry = false;
	var previousEntryPosition = null;
	for ( i = 0; i < credentials.credentials.length; i++) {
		var login = credentials.credentials[i].login;
		if (login == loginEntered) {
			previousEntry = true;
			previousEntryPosition = i;
		}
	}
	return [previousEntry, previousEntryPosition];
};

var makeDataForADPHelper = function(credentials, response) {
	if (credentials != null) {
		var credentials = JSON.parse(credentials);
		var checkDuplicateEntryResult = checkDuplicateEntry(credentials, response.appleId);
		if (checkDuplicateEntryResult[0] != false) {
			credentials.credentials[checkDuplicateEntryResult[1]].password = response.password;
			var savedTeams = credentials.credentials[checkDuplicateEntryResult[1]].teamName;
			var teamsToBeSaved = _.union(savedTeams, response.teams);
			credentials.credentials[checkDuplicateEntryResult[1]].teamName = teamsToBeSaved;
		} else {
			credentials.credentials.push({
				login : response.appleId,
				password : response.password,
				teamName : response.teams
			});
		}
		data = credentials;
	} else {
		data = {
			credentials : [{
				login : response.appleId,
				password : response.password,
				teamName : response.teams
			}]
		};
	}
	return data;
};

var makeDataForADP = exports.makeDataForADP = function(response, _callback) {
	getKeychain(function(pass) {
		var data = makeDataForADPHelper(pass, response);
		_callback(data);
	});
};

exports.getTeamsFromArray = function(credentials, _callback) {
	var data = [];
	for ( i = 0; i < credentials.length; i++) {
		var login = credentials[i].login;
		var password = credentials[i].password;
		var teamName = "";
		if (credentials[i].teamName.length > 0) {
			for ( j = 0; j < credentials[i].teamName.length; j++) {
				var contact = {
					login : login,
					password : password,
					teamName : credentials[i].teamName[j]
				};
				data.push(contact);
			}
		} else {
			data.push({
				login : login,
				password : password,
				teamName : teamName
			});
		}
	}
	_callback(data);
};

exports.makeDataForListOfLogin = function(param, _callback) {
	var logins = [];
	param = JSON.parse(param);
	for ( i = 0; i < param.credentials.length; i++) {
		var singleLogin = {
			name : param.credentials[i].login
		};
		logins.push(singleLogin);
	}
	_callback(logins);
};

exports.makeDataForListOfPP = function(param, _callback) {
	var pp = [];
	for ( i = 0; i < param.length; i++) {
		var singleDetail = {
			name : param[i],
			value : param[i].uuid
		};
		pp.push(singleDetail);
	}
	_callback(pp);
};

exports.makeDataForListOfTeams = function(param, _callback) {
	var teams = [];
	//param = JSON.parse(param);
	for ( i = 0; i < param.length; i++) {
		var singleTeam = {
			name : param[i]
		};
		teams.push(singleTeam);
	}
	_callback(teams);
};

/* add credentails */

exports.doPromptForADPCredentials = function(_callback) {
	fields.set([fields.text({
		title : 'Please enter your Apple Developer Portal Credentials.',
		promptLabel : 'Apple Id',
		validate : function(value, callback) {
			callback(!value.length, value);
		}
	}), fields.text({
		promptLabel : 'Password',
		password : true,
		validate : function(value, callback) {
			callback(!value.length, value);
		}
	})]).prompt(function(err, value) {
		if (err) {
			console.error('There was an error!\n' + err);
		} else {
			_callback(value);
		}
	});
};

/* list of credentials */

exports.showADPLoginDetails = function(_callback) {
	getKeychain(function(pass) {
		if (pass != null) {
			var credentials = JSON.parse(pass);
			credentials = credentials.credentials;
			_callback(credentials);
		} else {
			_callback(pass);
		}
	});
};

/* change credential */

exports.changeCredentials = function(email) {
	var loginDetails = null;

	getKeychain(function(pass) {
		loginDetails = pass;
		if (loginDetails != null) {
			var data = JSON.parse(loginDetails);
			var checkDuplicateEntryResult = checkDuplicateEntry(data, email);
			if (checkDuplicateEntryResult[0] != false) {
				doPromptForADPPassword(data, checkDuplicateEntryResult);
			} else {
				console.log("login:" + email + " not found in saved ADP credential");
			}
		} else {
			console.log(NO_KEYCHAIN_KEY_PRESENT);
		}
	});
};

var doPromptForADPPassword = function(credentials, checkDuplicateEntryResult) {
	fields.set([fields.text({
		promptLabel : 'Password',
		password : true,
		validate : function(value, callback) {
			callback(!value.length, value);
		}
	})]).prompt(function(err, value) {
		if (err) {
			console.error('There was an error!\n' + err);
		} else {
			credentials.credentials[checkDuplicateEntryResult[1]].password = value[0];
			setKeychain(credentials, function() {
				console.log("Credential changed successfully for login:" + credentials.credentials[checkDuplicateEntryResult[1]].login);
			});
		}
	});
};

/* remove credential */

exports.removeADPCredentials = function(email) {
	getKeychain(function(pass) {
		var credentials = pass;
		if (credentials != null) {
			var credentials = JSON.parse(credentials);
			var checkDuplicateEntryResult = checkDuplicateEntry(credentials, email);
			if (checkDuplicateEntryResult[0] != false) {
				var teams = credentials.credentials[checkDuplicateEntryResult[1]].teamName.length;

				if (teams > 1) {
					makeDataForPromptForRemoveMultipleTeams(credentials, checkDuplicateEntryResult[1]);
				} else {
					removeWholeEntry(credentials, checkDuplicateEntryResult[1]);
				}

			} else {
				console.log("login:" + email + " not found in saved ADP credential");
			}
		} else {
			console.log(NO_KEYCHAIN_KEY_PRESENT);
		}
	});
};

var makeDataForPromptForRemoveMultipleTeams = function(credentials, position) {
	var optionsToRemove = [{
		"name" : "Remove all teams associated with this Apple Id.",
		"value" : "all"
	}, {
		"name" : "Manually select team to be removed.",
		"value" : "select"
	}];

	var options = {
		"title" : "Please select one option.",
		"value" : "value",
		"format" : {
			option : function(opt, idx, num) {
				return '    ' + num + opt.name;
			}
		}
	};

	promptSelection(optionsToRemove, options, function(selected) {
		if (selected == "all") {
			removeWholeEntry(credentials, position);
		} else {
			makeDataForPromptToRemoveTeam(credentials, position, function(data) {
				var options = {
					"title" : 'Select a team which you want to delete from this Apple Id',
					"value" : "name",
					"format" : {
						option : function(opt, idx, num) {
							return '    ' + num + opt.name;
						}
					}
				};

				var teams = data.teams;
				promptSelection(teams, options, function(selectedTeam) {
					removeSelectedTeam(data, selectedTeam);
				});
			});
		}
	});

};

exports.getRecentlyUsedAppData = function(options, _callback) {
	var appId = options.appId;
	fs = require('fs');
	var sys = require('sys');
	var exec = require('child_process').exec;
	var child;
	var PATH;
	var command = 'whoami';
	child = exec(command, function(error, stdout, stderr) {
		if (error !== null) {
			logger.error('exec command "whoami" error: ' + error);
		} else {
			PATH = '/Users/' + stdout + '/.tiadp.json';
			PATH = PATH.replace(/(\r\n|\n|\r)/gm, "");
			fs.readFile(PATH, 'utf8', function(err, data) {
				if (err) {
					if (err.code == 'ENOENT') {
						createEmptyRecentFileInUsersHomeDirectory(PATH);
						var dataToReturn = {
							"present" : false
						};
						_callback(dataToReturn);
					}
				} else {
					var tiadpData = JSON.parse(data);

					var login,
					    team,
					    presentData;
					var presentInRecentlyList = false;
					for ( i = 0; i < tiadpData.appData.length; i++) {
						var current = tiadpData.appData[i];
						savedAppId = current.appId;
						if (savedAppId == appId) {
							presentData = current;
							presentInRecentlyList = true;
							break;
						}
					}

					var dataToReturn = {
						"present" : presentInRecentlyList,
						"data" : presentData
					};
					_callback(dataToReturn);
				}

			});
		}
	});

};

function createEmptyRecentFileInUsersHomeDirectory(PATH) {
	tiadpData = {
		"appData" : []
	};
	var sys = require('sys');
	var exec = require('child_process').exec;
	var child;
	var command = 'touch ~/.tiadp.json';

	child = exec(command, function(error, stdout, stderr) {
		if (error !== null) {
			logger.error('exec command "touch ~/.tiadp.json" error: ' + error);
		} else {
			setTimeout(function(e) {
				fs.writeFile(PATH, JSON.stringify(tiadpData, null, 4), function(err) {
					if (err) {
						return console.log("create empty" + err);
					}
				});
			}, 500);
		}
	});
}

exports.setRecentlyUsedAppData = function(options, _callback) {
	var appId = options.appId;
	fs = require('fs');

	var sys = require('sys');
	var exec = require('child_process').exec;
	var child;
	var command = 'whoami';

	child = exec(command, function(error, stdout, stderr) {
		if (error !== null) {
			logger.error('exec command "whoami" error: ' + error);
		} else {
			PATH = '/Users/' + stdout + '/.tiadp.json';
			PATH = PATH.replace(/(\r\n|\n|\r)/gm, "");
			fs.readFile(PATH, 'utf8', function(err, data) {
				if (err) {
					return console.log('error in write: ' + err);
				}

				var tiadpData = JSON.parse(data);

				var presentInRecentlyList = false;
				var previouslySavedDataIfPresent;
				var positionIfPresent;

				for ( i = 0; i < tiadpData.appData.length; i++) {
					var current = tiadpData.appData[i];
					savedAppId = current.appId;
					if (savedAppId == appId) {
						presentInRecentlyList = true;
						previouslySavedDataIfPresent = current;
						positionIfPresent = i;
						break;
					}
				}

				if (presentInRecentlyList) {
					_.extend(previouslySavedDataIfPresent, options);
					tiadpData.appData[positionIfPresent] = previouslySavedDataIfPresent;
				} else {
					var dataToSave = {
						"appId" : "",
						"adpLogin" : "",
						"team" : "",
						"developmentProfile" : "",
						"developmentCertificate" : "",
						"adhocProfile" : "",
						"adhocCertificate" : ""
					};
					_.extend(dataToSave, options);
					tiadpData.appData.push(dataToSave);
				}

				fs.writeFile(PATH, JSON.stringify(tiadpData, null, 4), function(err) {
					if (err) {
						return console.log(err);
					}
				});

				var dataToReturn = {
					"present" : presentInRecentlyList
				};

				_callback(dataToReturn);
			});
		}
	});

};

exports.getCurrentUserADPPasswordFromKeychain = function(options, _callback) {
	getKeychain(function(keychainData) {
		if (keychainData != null) {
			var keychainData = JSON.parse(keychainData);
			var password;
			var presentInKeychain = false;
			for ( i = 0; i < keychainData.credentials.length; i++) {
				var current = keychainData.credentials[i];
				var keychainLogin = current.login;
				if (keychainLogin == options.login) {
					password = current.password;
					presentInKeychain = true;
					break;
				}
			}

			var dataToReturn = {
				"present" : presentInKeychain,
				"data" : {
					"password" : password
				}
			};

			_callback(dataToReturn);
		} else {
			var dataToReturn = {
				"present" : false
			};
			_callback(dataToReturn);
		}

	});
};

var makeDataForPromptToRemoveTeam = function(credentials, position, _callback) {
	var teams = credentials.credentials[position].teamName;
	var formattedTeams = [];
	for ( i = 0; i < teams.length; i++) {
		var singleTeam = {
			name : teams[i]
		};
		formattedTeams.push(singleTeam);
	}
	var response = {
		credentials : credentials,
		position : position,
		teams : formattedTeams
	};
	_callback(response);
};

var removeSelectedTeam = function(data, selectedTeam) {
	var positionOfTeam = data.credentials.credentials[data.position].teamName.indexOf(selectedTeam);
	positionOfTeam != -1 ? data.credentials.credentials[data.position].teamName.splice(positionOfTeam, 1) : console.log('team not found');
	setKeychain(data.credentials, function(e) {
		console.log('team:' + selectedTeam + ' removed successfully from Apple Id:' + data.credentials.credentials[data.position].login);
	});
};

var removeWholeEntry = function(credentials, position) {
	var loginToRemove = credentials.credentials[position].login;
	credentials.credentials.splice(position, 1);
	setKeychain(credentials, function(data) {
		console.log("Apple Id:" + loginToRemove + " removed successfully");
	});
};

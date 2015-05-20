#! /usr/bin/env node

var tiadpHelper = require('./lib/tiadpHelper');
var network = require('./lib/network');

var userArgs = process.argv.splice(2);
var subcommand = userArgs[0];

switch (subcommand) {
case "list":
	tiadpHelper.showADPLoginDetails(function(res) {
		if (res != null) {
			if (res.length > 0) {
				tiadpHelper.getTeamsFromArray(res, function(loginDetails) {
					for ( i = 0; i < loginDetails.length; i++) {
						console.log(i + 1 + "." + " login: " + loginDetails[i].login + " password: ******" + " team:" + loginDetails[i].teamName);
					}
				});
			} else {
				console.log(tiadpHelper.NO_KEYCHAIN_KEY_PRESENT);
			}

		} else {
			console.log(tiadpHelper.NO_KEYCHAIN_KEY_PRESENT);
		}
	});
	break;
case "add":
	tiadpHelper.doPromptForADPCredentials(function(data) {
		formdata = {
			"appleId" : data[0],
			"password" : data[1]
		};
		console.info("Querying the Apple Developer Portal...");
		network.doNetworkRequest("validateADPCredentials", formdata, function(res) {
			var parsedResponse = JSON.parse(res);
			if (parsedResponse.result != "failed") {
				var dataToPass = {
					"appleId" : data[0],
					"password" : data[1],
					"teams" : []
				};
				for ( i = 0; i < parsedResponse.teams.length; i++) {
					dataToPass.teams.push(parsedResponse.teams[i].teamName);
				}
				if (dataToPass.teams.length > 1) {
					var teamsForSelection = dataToPass.teams.slice();
					teamsForSelection.push('Save all Teams');
					promptToSelectTeam(teamsForSelection, function(selectedTeam) {
						if (selectedTeam == 'Save all Teams') {
							//do nothing
						} else {

							dataToPass.teams = [selectedTeam];
						}
						tiadpHelper.makeDataForADP(dataToPass, function(res) {
							tiadpHelper.saveADPCredentials(res, function(ret) {
								// do nothing
							});
						});
					});
				} else {
					tiadpHelper.makeDataForADP(dataToPass, function(res) {
						tiadpHelper.saveADPCredentials(res, function(ret) {
							// do nothing
						});
					});
				}

			} else {
				//ADP authentication failed
				console.log("Failed, " + parsedResponse.message);
			}
		}, function(errCode) {
			if (errCode.hasOwnProperty('code')) {
				console.error('An Error Occured, Server Not Responding.');
			} else {
				switch(errCode) {
				case 404 :
					console.error('An Error Occured, Invalid Url.');
					break;
				default :
					console.error("An Error Occured, Response Code: " + errCode);
				}
			}
		});
	});
	break;
case "remove":
case "delete":
	if (userArgs[1] != undefined) {
		tiadpHelper.removeADPCredentials(userArgs[1]);
	} else {
		promptToSelectLogin(function(login) {
			if (login == null) {
				console.log(tiadpHelper.NO_KEYCHAIN_KEY_PRESENT);
				return
			}
			tiadpHelper.removeADPCredentials(login);
		});
	}
	break;
case "change":
case "modify":
	if (userArgs[1] != undefined) {
		tiadpHelper.changeCredentials(userArgs[1]);
	} else {
		promptToSelectLogin(function(login) {
			if (login == null) {
				console.log(tiadpHelper.NO_KEYCHAIN_KEY_PRESENT);
				return
			}
			tiadpHelper.changeCredentials(login);
		});
	}
	break;
case "help":
case "--help":
	showHelpOptions();
	break;
default:
	showHelpOptions();
}

function showHelpOptions() {
	commands = [{
		command : "add",
		description : "add a new login"
	}, {
		command : "remove/delete",
		description : "removes a login"
	}, {
		command : "change/modify",
		description : "change the password for an entry"
	}, {
		command : "list",
		description : "shows all adp logins (email, masked password, team) saved"
	}];

	var output = "Manages the keystore entries of installr cli plugin.\n\n";
	output += "usage: tiadp <command> <adp login email/username>\n\n";
	output += "available commands:\n";
	for ( i = 0; i < commands.length; i++) {
		output += i + 1 + ". " + commands[i].command + "\n";
		output += commands[i].description + "\n\n";
	}

	console.log(output);
};

function promptToSelectLogin(_callback) {
	var options = {
		"title" : "Select an Apple Id on which you want to perform this action.",
		"value" : "name",
		"format" : {
			option : function(opt, idx, num) {
				return '    ' + num + opt.name;
			}
		}
	};

	tiadpHelper.getKeychain(function(loginDetail) {
		if (loginDetail == null) {
			console.log(tiadpHelper.NO_KEYCHAIN_KEY_PRESENT);
			return
		}
		tiadpHelper.makeDataForListOfLogin(loginDetail, function(data) {
			tiadpHelper.promptSelection(data, options, function(selectedLogin) {
				_callback(selectedLogin);
			});
		});
	});
}

function promptToSelectTeam(teams, _callback) {
	var options = {
		"title" : "Which team do you want to save.",
		"value" : "name",
		"format" : {
			option : function(opt, idx, num) {
				return '    ' + num + opt.name;
			}
		}
	};
	tiadpHelper.makeDataForListOfTeams(teams, function(data) {
		tiadpHelper.promptSelection(data, options, function(selectedTeam) {
			_callback(selectedTeam);
		});
	});
}


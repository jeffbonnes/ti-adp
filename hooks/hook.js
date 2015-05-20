var _ = require('underscore')._;
var fields = require('fields');
var request = require('request');
var keychain = require('keychain');
var iosDevice = require('node-ios-device');
var provisioning = require('provisioning');
var moment = require('moment');

var tiadpHelper = require('../lib/tiadpHelper');
var network = require('../lib/network');

var myCommand,
    tiapp,
    installrApiToken,
    signingValues;

var editExistingPPValue = false;
var deleteOlderProvisioningProfile = false;
var saveInRecent = false;
var presentInKeychain = false;

var signingProperties = {
	DEVELOPMENT : {
		cliTarget : "device",
		certificateType : "devNames",
		profileType : "development",
		adpProfileType : 'limited',
		cliFlag : 'V'
	},
	ADHOC : {
		cliTarget : "dist-adhoc",
		certificateType : "distNames",
		profileType : "adhoc",
		adpProfileType : 'store',
		cliFlag : 'R'
	}
};

var device = {
	name : null,
	UDID : null
};

exports.cliVersion = ">=3.4";

var logger,
    config,
    cli,
    appc,
    finished,
    createPPValue,
    presentInLocalValue,
    localProvisionalProfileSelected,
    userTeams,
    recentlyAppDataToSave;

var selectedDevice = null;

function checkAttachedDevices(info) {
	if (process.argv.indexOf('--auto-device') !== -1) {
		logger.info('Getting details of attached devices.');
		iosDevice.devices(function(err, devices) {
			logger.info("Found " + devices.length + " connected devices");
			if (devices.length == 1) {
				selectedDevice = devices[0];
				logger.info('Attached device name: ' + selectedDevice.name);
				device.name = selectedDevice.name;
				device.UDID = selectedDevice.udid;
				getPPDetails(info);
			} else if (devices.length > 1) {
				//prompt user to select the device
				promptToSelectDevice(devices, function(selected) {
					selectedDevice = JSON.parse(selected);
					logger.info('Selected device name' + selectedDevice.name);
					device.name = selectedDevice.name;
					device.UDID = selectedDevice.udid;
					addCliArg(cli, 'C', selectedDevice.udid);
					getPPDetails(info);
				});
			} else {
				logger.error("You must attach a device to continue.");
				process.exit();
			}
		});
	} else {
		getPPDetails(info);
	}
}

function promptToSelectDevice(devices, _callback) {
	var formattedDevices = [];
	for ( i = 0; i < devices.length; i++) {
		var singleDevice = {
			name : devices[i].name + " udid:" + devices[i].udid,
			value : JSON.stringify(devices[i])
		};
		formattedDevices.push(singleDevice);
	}

	var options = {
		"title" : "Please select one device.",
		"value" : "value",
		"format" : {
			option : function(opt, idx, num) {
				return '    ' + num + opt.name;
			}
		}
	};

	tiadpHelper.promptSelection(formattedDevices, options, function(selected) {
		_callback(selected);
	});
}

function getPPDetails(info) {
	// Do we have a Installr API Key?
	// Check the Project first, then global
	installrApiToken = tiapp.getProperty('installr.api_token');
	if (!installrApiToken) {
		installrApiToken = process.env.INSTALLR_API_TOKEN;
	}

	if (!installrApiToken) {
		logger.error("Installr API Token not found. Please set it in tiapp.xml or the INSTALLR_API_TOKEN environment variable.");
		process.exit();
	}

	// Any local certs match?
	var possibleProfiles = _.filter(info.provisioningProfiles[signingValues.profileType], function(profile) {
		return profile.appId == tiapp.id;
	});

	var possibleCerts = info.certs[signingValues.certificateType];

	tiadpHelper.getRecentlyUsedAppData({
		'appId' : tiapp.id
	}, function(response) {
		process.argv.indexOf('--force') !== -1 ? response = false : logger.info('Execution command without force');
		if (response.present) {
			var recentyUsedData = response.data;
			tiadpHelper.getCurrentUserADPPasswordFromKeychain({
				'login' : recentyUsedData.adpLogin
			}, function(passData) {
				if (passData.present) {
					presentInKeychain = true;
					_.extend(recentyUsedData, passData.data);
					validateRecentlyData({
						"recentyUsedData" : recentyUsedData,
						"possibleProfiles" : possibleProfiles
					}, function(e) {
						checkDoThisNeedsToBeSavedInRecentList();
					});
				} else {
					logger.error('Something Went wrong, Please execute the command with --force argument.');
				}
			});
		} else {
			doNotHaveRecentlySavedCredentials(possibleProfiles);
		}
	});
}

function validateRecentlyData(data, _callback) {
	logger.info('Validating recently used data.');
	var recentyUsedData = data.recentyUsedData;
	var recentlySavedProfile;
	if (process.argv.indexOf('--auto-device') !== -1) {
		recentlySavedProfile = recentyUsedData.developmentProfile;
	} else {
		recentlySavedProfile = recentyUsedData.adhocProfile;
	}
	var possibleProfiles = data.possibleProfiles;
	var ppPresentInLocal = false;
	_.each(possibleProfiles, function(profile) {
		if (profile.uuid == recentlySavedProfile) {
			ppPresentInLocal = true;
		}
	});

	if (process.argv.indexOf('--auto-device') !== -1) {
		if (recentlySavedProfile != '' && recentyUsedData.developmentCertificate != '') {
			if (ppPresentInLocal) {
				logger.info('Using recently saved developer provisioning data for build.');
				addCliArg(cli, "P", recentlySavedProfile);
				addCliArg(cli, signingValues.cliFlag, recentyUsedData.developmentCertificate);
				finished();
			} else {
				logger.info('Recently used provisioning profile not present in your system');
				presentInLocalValue = false;
				createPPValue = false;
				getProvisioningDataFromApple(recentyUsedData, _callback);
			}
		} else {
			logger.info('Developer provisioning data not found in recently saved data.');
			checkProvisionalProfile({"possibleProfiles":possibleProfiles,"presentInRecent":true}, function(e) {
				getProvisioningDataFromApple(recentyUsedData, _callback);
			});
		}
	} else {
		if (recentlySavedProfile != '' && recentyUsedData.adhocCertificate != '') {
			if (ppPresentInLocal) {
				logger.info('Using recently saved adhoc provisioning data for build.');
				addCliArg(cli, "P", recentlySavedProfile);
				addCliArg(cli, signingValues.cliFlag, recentyUsedData.adhocCertificate);
				finished();
			} else {
				logger.info('Recently used provisioning profile not present in your system');
				presentInLocalValue = false;
				createPPValue = false;
				getProvisioningDataFromApple(recentyUsedData, _callback);
			}
		} else {
			logger.info('Adhoc provisioning data not found in recently saved data.');
			checkProvisionalProfile({"possibleProfiles":possibleProfiles,"presentInRecent":true}, function(e) {
				getProvisioningDataFromApple(recentyUsedData, _callback);
			});
		}
	}
}

function getProvisioningDataFromApple(recentData, _callback) {
	sendNetworkRequestToGetProvisionalProfile({
		"login" : recentData.adpLogin,
		"password" : recentData.password,
		"teamName" : recentData.team
	}, {
		createPP : createPPValue,
		presentInLocal : presentInLocalValue
	}, _callback);
}

function doNotHaveRecentlySavedCredentials(possibleProfiles) {
	checkProvisionalProfile({"possibleProfiles":possibleProfiles,"presentInRecent":false}, function(e) {
		createPPValue = false;
		if (possibleProfiles.length == 0) {
			presentInLocalValue = false;
		} else {
			presentInLocalValue = true;
		}
		checkSavedADPCredentials(function(res) {
			logger.info("Checking saved credentials");
			if (res[0] == true) {
				//prompt user to select saved ADP credentials
				tiadpHelper.getTeamsFromArray(res[1], function(data) {
					promptForADPCredentials(data, function(value) {
						if (value != "addNew") {
							sendNetworkRequestToGetProvisionalProfile(value, {
								createPP : createPPValue,
								presentInLocal : presentInLocalValue
							}, function(e) {
								//finished();
								checkDoThisNeedsToBeSavedInRecentList();
							});
						} else {
							addNewLoginDetails();
						}
					});
				});
			} else {
				logger.info("No saved credentials available in keychain.");
				addNewLoginDetails();
			}
		});
	});
}

function checkProvisionalProfile(options ,_callback) {
	var possibleProfiles = options.possibleProfiles;
	logger.info('Finding matching provisioning profiles in your system.');
	if (possibleProfiles.length == 1) {
		var theProfile = possibleProfiles[0];
		localProvisionalProfileSelected = possibleProfiles[0].uuid;
		logger.info('One possible provisioning profile found, using ' + theProfile.name);
		setProvisionalProfileInCli(theProfile.uuid, _callback);
	} else if (possibleProfiles.length > 1) {
		// Let them choose one provisional profile
		logger.info("Found " + possibleProfiles.length + " possible provisioning profiles. Which one would you like to use?");
		tiadpHelper.makeDataForListOfPP(possibleProfiles, function(formattedProfiles) {
			var options = {
				"title" : 'Please select provisioning profile you want to use.',
				"value" : "value",
				"format" : {
					option : function(opt, idx, num) {
						return '    ' + num + "name: " + opt.name.name + "  uuid:" + opt.name.uuid;
					}
				}
			};

			tiadpHelper.promptSelection(formattedProfiles, options, function(selectedPPUUID) {
				localProvisionalProfileSelected = selectedPPUUID;
				logger.info('Selected Provisioning Profile: ' + selectedPPUUID);
				setProvisionalProfileInCli(selectedPPUUID, _callback);
			});
		});
	} else {
		logger.info('Local provisioning profile not found, checking Apple Developer Portal.');
		// Will need to check the Apple Developer Portal
		createPPValue = false;
		presentInLocalValue = false;
		if(options.presentInRecent){
			_callback();
		}else{
			createNewPP();
		}	
	}
}

function setProvisionalProfileInCli(selectedPP, _callback) {
	if (process.argv.indexOf('--auto-device') !== -1) {
		doAttachedDevicePresentInProvisionalProfile(selectedPP, function(bool) {
			logger.info("Attached device present in provisioning profile:" + bool);
			if (bool) {
				logger.info('setting flag -P ' + selectedPP);
				cli.argv.$_.push('-P');
				cli.argv.$_.push(selectedPP);
				cli.globalContext.argv.P = selectedPP;
				_callback();
			} else {
				//prompt user to select saved ADP credentials
				createPPValue = false;
				presentInLocalValue = true;
				editExistingPPValue = true;
				deleteOlderProvisioningProfile = true;
				createNewPP();
			}
		});
	} else {
		logger.info('setting flag -P ' + selectedPP);
		cli.argv.$_.push('-P');
		cli.argv.$_.push(selectedPP);
		cli.globalContext.argv.P = selectedPP;
		_callback();
	}

}

function createNewPP() {
	if (editExistingPPValue == true) {
		logger.info('Attached device was not present in your local provisioning profile.');
	}
	checkSavedADPCredentials(function(res) {
		if (res[0] == true) {
			//prompt user to select saved ADP credentials
			tiadpHelper.getTeamsFromArray(res[1], function(data) {
				promptForADPCredentials(data, function(adpinfo) {
					if (adpinfo != "addNew") {
						sendNetworkRequestToGetProvisionalProfile(adpinfo, {
							createPP : createPPValue,
							presentInLocal : presentInLocalValue
						}, function(ret) {
							//do nothing
						});
					} else {
						addNewLoginDetails();
					}
				});
			});
		} else {
			addNewLoginDetails();
		}
	});
}

function doAttachedDevicePresentInProvisionalProfile(selectedProvisionalProfile, _callback) {
	logger.info("Checking if the attached device is present in local provisioning profile.");
	var ppLocation = "~/Library/MobileDevice/'Provisioning Profiles'/" + selectedProvisionalProfile + ".mobileprovision";
	provisioning(ppLocation, function(error, data) {
		var devices = data.ProvisionedDevices;
		var doAttachedDevicePresent = devices.indexOf(device.UDID) == -1 ? false : true;
		_callback(doAttachedDevicePresent);
	});
}

function addNewLoginDetails() {
	tiadpHelper.doPromptForADPCredentials(function(data) {
		sendNetworkRequestToGetProvisionalProfile({
			"login" : data[0],
			"password" : data[1]
		}, {
			createPP : createPPValue,
			presentInLocal : presentInLocalValue
		}, function(e) {
			//finished();
			checkDoThisNeedsToBeSavedInRecentList();
		});

	});
}

function checkSavedADPCredentials(_callback) {
	var returndata = null;
	tiadpHelper.showADPLoginDetails(function(res) {
		if (res != null) {
			if (res.length > 0) {
				returndata = [true, res];
			} else {
				returndata = [false, res];
			}
		} else {
			returndata = [false, res];
		}
		_callback(returndata);
	});
}

function promptForADPCredentials(data, _callback) {
	var formattedCredentials = [];
	for ( i = 0; i < data.length; i++) {
		var singleDetail = {
			name : 'Apple Id:' + data[i].login + '  password: ******  team:' + data[i].teamName,
			value : JSON.stringify(data[i])
		};
		formattedCredentials.push(singleDetail);
	}

	var addManually = {
		name : "Use another Apple Id.",
		value : "addNew"
	};

	formattedCredentials.push(addManually);

	var options = {
		"title" : 'Please select Apple Developer Account.',
		"value" : "value",
		"format" : {
			option : function(opt, idx, num) {
				return '    ' + num + opt.name;
			}
		}
	};
	tiadpHelper.promptSelection(formattedCredentials, options, function(selected) {
		if (selected != "addNew") {
			presentInKeychain = true;
			_callback(JSON.parse(selected));
		} else {
			_callback(selected);
		}
	});
}

function sendNetworkRequestToGetProvisionalProfile(data, options, _callback) {
	var formdata = {
		appleId : data.login,
		password : data.password,
		teamName : data.teamName,
		profileType : signingValues.adpProfileType,
		appId : tiapp.id,
		createPP : options.createPP,
		appName : tiapp.name,
		presentInLocal : options.presentInLocal,
		certificateToAdd : data.certificateToAdd,
		deviceName : device.name,
		deviceUDID : device.UDID,
		editExistingPP : editExistingPPValue,
		appToken : installrApiToken
	};

	recentlyAppDataToSave = {
		"appId" : tiapp.id,
		"adpLogin" : data.login,
		"team" : data.teamName
	};

	logger.info("Querying the Apple Developer Portal...");
	var busy = new appc.busyindicator();
	busy.start();

	network.doNetworkRequest("findCreateProvisioningProfile", formdata, function(res) {
		var returnVal = JSON.parse(res);
		busy.stop();
		switch(returnVal.result) {
			case "success":
				doSystemHasCertificatePresentInLocal(returnVal.certificateList, function(certs) {
					requestPromptforSelectionOfCertificateToUse(certs, function(selectedCertificateName) {
						logger.debug(returnVal.message);
						addCliArg(cli, signingValues.cliFlag, selectedCertificateName);
						if (deleteOlderProvisioningProfile) {
							deleteOlderProvisionalProfileInCaseOfEdit();
						}
						_callback();
					});
				});
				break;
			case "promptForPP":
				tiadpHelper.promtToSelectYesNo({
					message : returnVal.message
				}, function(res, value) {
					if (process.argv.indexOf('--auto-device') !== -1) {
						logger.info("Sending request to create new development provisioning profile.");
						sendNetworkRequestToGetProvisionalProfile(data, {
							createPP : true,
							presentInLocal : true
						}, _callback);
					} else {
						requestPromptforCertificateToUseInPP(returnVal, function(selectedCertificate) {
							data.certificateToAdd = selectedCertificate;
							logger.info("Sending request to create new Ad hoc provisioning profile.");
							sendNetworkRequestToGetProvisionalProfile(data, {
								createPP : true,
								presentInLocal : true
							}, _callback);
						});
					}
				}, function(value) {
					logger.info("You have selected 'No', exiting all processes.");
				});
				break;
			case "promptForTeam":
			case "invalidTeam":
				requestPromptforTeamSelection(returnVal, function(selectedTeam) {
					data.teamName = selectedTeam;
					var dataToPass = {
						"appleId" : data.login,
						"password" : data.password,
						"teams" : [selectedTeam]
					};
					tiadpHelper.makeDataForADP(dataToPass, function(res) {
						tiadpHelper.saveADPCredentials(res, function(value) {
							saveInRecent = true;
							_.extend(recentlyAppDataToSave, {
								"team" : selectedTeam
							});
							sendNetworkRequestToGetProvisionalProfile(data, options, _callback);
						});
					});
				});
				break;
			case "downloadPP":
				downloadProvisioningProfile(returnVal, function(res) {
					setTimeout(function() {
						installProvisionalProfile(res);
					}, 5000);
				});
				break;
			case "failed":
				logger.error(returnVal.message);
				break;
			default:
				logger.error(JSON.stringify(returnVal));
		}
	}, function(errCode) {

		busy.stop();

		if (errCode.hasOwnProperty('code')) {
			logger.error('An Error Occured, Server Not Responding.');
		} else {
			switch(errCode) {
				case 302 :
					logger.error('An Error Occured, Invalid Installr API Token.');
					break;
				case 404 :
					logger.error('An Error Occured, Invalid Url.');
					break;
				default :
					logger.error("An Error Occured, Response Code: " + errCode);
			}
		}
	});
}

function requestPromptforTeamSelection(response, _callback) {
	userTeams = [];
	var formattedTeams = [];
	for ( i = 0; i < response.teams.length; i++) {
		var singleTeam = {
			name : response.teams[i].teamName
		};
		formattedTeams.push(singleTeam);
	}

	var options = {
		"title" : response.message,
		"value" : "name",
		"format" : {
			option : function(opt, idx, num) {
				return '    ' + num + opt.name;
			}
		}
	};
	tiadpHelper.promptSelection(formattedTeams, options, function(selected) {
		userTeams.push(selected);
		_callback(selected);
	});
}

function doSystemHasCertificatePresentInLocal(serverCertificates, _callback) {
	var sys = require('sys');
	var exec = require('child_process').exec;
	var child;
	var command = 'whoami';
	child = exec(command, function(error, stdout, stderr) {
		if (error !== null) {
			logger.error('exec command "whoami" error: ' + error);
		} else {
			var key = "/Users/" + stdout + "/Library/Keychains/login.keychain";
			key = key.replace(/(\r\n|\n|\r)/gm, '');
			var command = 'ti info -o json';
			var child = exec(command, {
				maxBuffer : 1024 * 1024
			}, function(error, stdout, stderr) {
				if (error !== null) {
					logger.error('exec command "ti info -o json" error: ' + error);
				} else {
					logger.info('Verifying local certificates with Apple developer portal.');
					var json = JSON.parse(stdout);
					var localCertificates;
					if (process.argv.indexOf('--auto-device') !== -1) {
						localCertificates = json.ios.certs.keychains[key].developer;
					} else {
						localCertificates = json.ios.certs.keychains[key].distribution;
					}
					var allMatchingCertificatesPresent = [];
					for ( i = 0; i < localCertificates.length; i++) {
						for ( j = 0; j < serverCertificates.length; j++) {
							var localName = localCertificates[i].name;
							var localExpiry = localCertificates[i].after;
							var localExpired = localCertificates[i].expired;
							var localInvalid = localCertificates[i].invalid;
							var serverName = serverCertificates[j].name + " (" + serverCertificates[j].ownerId + ")";
							var serverExpiry = serverCertificates[j].expirationDate;
							if ((localName == serverName) && (moment(localExpiry).isSame(serverExpiry))) {
								allMatchingCertificatesPresent.push({
									"certificateData" : serverCertificates[j],
									"expired" : localExpired,
									"invalid" : localInvalid
								});
							}
						}
					}

					var certificatesToSendForPrompt = [];
					var expiredOrInvalidCertificates = [];
					for ( j = 0; j < allMatchingCertificatesPresent.length; j++) {
						if (allMatchingCertificatesPresent[j].expired != true && allMatchingCertificatesPresent[j].invalid != true) {
							certificatesToSendForPrompt.push(allMatchingCertificatesPresent[j].certificateData);
						} else {
							expiredOrInvalidCertificates.push(allMatchingCertificatesPresent[j].certificateData);
						}
					}

					if (expiredOrInvalidCertificates.length > 0) {
						logger.error(expiredOrInvalidCertificates.length + " matching certificates are invalid or expired");
						for ( k = 0; k < expiredOrInvalidCertificates.length; k++) {
							logger.debug(k + 1 + ":" + expiredOrInvalidCertificates[k]);
						}
					}

					_callback(certificatesToSendForPrompt);
				}
			});
		}
	});
}

function requestPromptforSelectionOfCertificateToUse(response, _callback) {
	if (response.length == 1) {
		_callback(response[0].name + " (" + response[0].ownerId + ")");
	} else if (response.length > 1) {
		var formattedCertificates = [];
		for ( i = 0; i < response.length; i++) {
			var singleCertificate = {
				name : response[i].name + " expiry:" + response[i].expirationDateString,
				value : response[i].name + " (" + response[i].ownerId + ")"
			};
			formattedCertificates.push(singleCertificate);
		}

		var options = {
			"title" : "Select the certificate you wish to generate this build",
			"value" : "value",
			"format" : {
				option : function(opt, idx, num) {
					return '    ' + num + opt.name;
				}
			}
		};

		tiadpHelper.promptSelection(formattedCertificates, options, function(selected) {
			_callback(selected);
		});
	} else {
		logger.error('Required certificate(s) not found on your local machine.');
	}

}

function requestPromptforCertificateToUseInPP(response, _callback) {
	doSystemHasCertificatePresentInLocal(response.certificateToPrompt, function(availableCerts) {
		if (availableCerts.length == 1) {
			_callback(availableCerts[0].certificateId);
		} else if (availableCerts.length > 1) {
			var formattedCertificates = [];
			for ( i = 0; i < availableCerts.length; i++) {
				var singleCertificate = {
					name : availableCerts[i].name + " expiry:" + availableCerts[i].expirationDateString,
					value : availableCerts[i].certificateId
				};
				formattedCertificates.push(singleCertificate);
			}

			var options = {
				"title" : "Select the certificate you wish to include in this provisioning profile. To use this profile to install an app, the certificate the app was signed with must be included. ",
				"value" : "value",
				"format" : {
					option : function(opt, idx, num) {
						return '    ' + num + opt.name;
					}
				}
			};
			tiadpHelper.promptSelection(formattedCertificates, options, function(selected) {
				_callback(selected);
			});
		} else {
			logger.error('Required certificate(s) not found on your local machine.');
		}
	});
}

function downloadProvisioningProfile(data, _callback) {
	logger.info('Downloading Provisioning Profile.');
	var options = {
		"url" : data.ppDownloadUrl,
		"filename" : data.ppUUID + '.mobileprovision '
	};

	network.downloadFileRequest(options, function(response) {
		logger.info('Download complete.');
		doSystemHasCertificatePresentInLocal(data.certificateList, function(certs) {
			requestPromptforSelectionOfCertificateToUse(certs, function(selectedCertificateName) {
				_callback({
					"pp" : options.filename,
					"certificateName" : selectedCertificateName,
					"ppUUID" : data.ppUUID,
					"s3key" : data.s3key
				});
			});
		}, function(error) {
			logger.error('Error: ' + error);
		});
	});
}

function installProvisionalProfile(data) {
	logger.info('Installing downloded provisioning profile.');
	var sys = require('sys');
	var exec = require('child_process').exec;
	var child;
	var command = "mv " + data.ppUUID + ".mobileprovision  ~/Library/MobileDevice/'Provisioning Profiles'/";
	child = exec(command, function(error, stdout, stderr) {
		if (error !== null) {
			logger.error('exec command "mv {pp} {installtion directory}" error: ' + error);
		} else {
			deleteProvisionalProfileFromS3Bucket(data.s3key);
			if (deleteOlderProvisioningProfile) {
				deleteOlderProvisionalProfileInCaseOfEdit();
			}
			postionOfParameterIfExist = cli.argv.$_.indexOf("-P");
			// removes -P argument from cli args if already present.
			if (postionOfParameterIfExist != -1) {
				cli.argv.$_.splice(postionOfParameterIfExist, 2);
			}
			logger.info('setting flag -P ' + data.ppUUID);
			cli.argv.$_.push('-P');
			cli.argv.$_.push(data.ppUUID);
			cli.globalContext.argv.P = data.ppUUID;
			addCliArg(cli, signingValues.cliFlag, data.certificateName);
			//finished();
			checkDoThisNeedsToBeSavedInRecentList();
		}
	});
}

function deleteOlderProvisionalProfileInCaseOfEdit() {
	logger.info('Deleting existing provisioning profile.');
	var sys = require('sys');
	var exec = require('child_process').exec;
	var child;
	var command = "rm ~/Library/MobileDevice/'Provisioning Profiles'/" + localProvisionalProfileSelected + ".mobileprovision";
	child = exec(command, function(error, stdout, stderr) {
		if (error !== null) {
			logger.error('exec command "rm {older pp path}" error: ' + error);
		} else {
			logger.info('Existing provisioning profile removed successfully.');
		}
	});
}

function deleteProvisionalProfileFromS3Bucket(key) {
	network.doNetworkRequest("deleteFileFromS3", {
		"s3key" : key
	}, function(e) {
		// logger.info('Temporary provisioning profile removed from s3 bucket.');
	}, function(err) {
		logger.debug(err);
	});
}

function configure(data, p_finished) {

	finished = p_finished;
	signingValues = null;
	if (process.argv.indexOf('--auto-device') !== -1) {
		signingValues = signingProperties.DEVELOPMENT;
		myCommand = "auto-device";
	}

	if (process.argv.indexOf('--auto-adhoc') !== -1) {
		myCommand = "auto-adhoc";
		signingValues = signingProperties.ADHOC;

		// Set a default for the Output directory if there isn't one
		if (process.argv.indexOf('--output-dir') == -1 && process.argv.indexOf('-O') == -1) {
			addCliArg(cli, 'O', 'build/ios/bin');
		}
	}

	if (signingValues) {

		logger.info('Performing Auto-Provisioning');

		addCliArg(cli, 'p', 'ios');
		addCliArg(cli, 'T', signingValues.cliTarget);

		tiapp = require('tiapp.xml').load();

		// Get the App Name and App Id from tiapp.xml
		if (!tiapp) {
			logger.error('tiapp.xml not found. ' + myCommand + ' must be run from root of the project directory');
			process.exit();
		}

		appc.ios.detect(checkAttachedDevices);
	} else {
		finished();
	}
}

function saveDataInRecentlyList() {
	var dataToSave = recentlyAppDataToSave;
	var positionOfProfileTagInCli = cli.argv.$_.indexOf('-P');
	if (process.argv.indexOf('--auto-device') !== -1) {
		var positionOfCertificateTagInCli = cli.argv.$_.indexOf('-V');
		var developmentData = {
			"developmentProfile" : cli.argv.$_[positionOfProfileTagInCli + 1],
			"developmentCertificate" : cli.argv.$_[positionOfCertificateTagInCli + 1]
		};
		_.extend(dataToSave, developmentData);
	} else {
		var positionOfCertificateTagInCli = cli.argv.$_.indexOf('-R');
		var adhocData = {
			"adhocProfile" : cli.argv.$_[positionOfProfileTagInCli + 1],
			"adhocCertificate" : cli.argv.$_[positionOfCertificateTagInCli + 1]
		};
		_.extend(dataToSave, adhocData);
	}

	tiadpHelper.setRecentlyUsedAppData(dataToSave, function(present) {
		if (present) {
			logger.info('App data modified in recently list.');
		} else {
			logger.info('App data saved in recently list.');
		}
		finished();
	});
}

function checkDoThisNeedsToBeSavedInRecentList() {
	var validate = false;
	if (presentInKeychain) {
		validate = true;
	} else {
		if (saveInRecent) {
			validate = true;
		}
	}
	if (validate) {
		saveDataInRecentlyList();
	}
}

exports.init = function(p_logger, p_config, p_cli, p_appc) {
	// Setup the global appc objects so we can access them from anywhere
	logger = p_logger;
	config = p_config;
	cli = p_cli;
	appc = p_appc;
	cli.on("cli:go", configure);
	//cli.on("cli:command-loaded", checkDoThisNeedsToBeSavedInRecentList);
};

function addCliArg(cli, flag, value) {
	logger.info('setting flag -' + flag + " " + value);
	cli.argv.$_.push("-" + flag);
	cli.argv.$_.push(value);
	cli.globalContext.argv[flag] = value;
}

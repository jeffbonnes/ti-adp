var request = require('request');
var fs = require('fs');

const INSTALLR_HOST = 'https://www.installrapp.com/adpRobot/';

exports.doNetworkRequest = function(action, formdata, _success, _failure) {
	request({
		url : INSTALLR_HOST + action,
		headers : {
			'X-InstallrAppToken' : formdata.appToken
		},
		method : "POST",
		form : formdata
	}, function(error, response, body) {
		if (!error && response.statusCode === 200) {
			_success(body);
		} else {
			if (response) {
				_failure(response.statusCode);
			} else {
				_failure(error);
			}
		}
	});
};

exports.downloadFileRequest = function(options, _callback, _failure) {
	var uri = options.url;
	var filename = options.filename.trim();
	request.head(uri, function(err, res, body) {
		var r = request(uri).pipe(fs.createWriteStream(filename));
		r.on('close', _callback);
		r.on('error', _failure);
	});

};

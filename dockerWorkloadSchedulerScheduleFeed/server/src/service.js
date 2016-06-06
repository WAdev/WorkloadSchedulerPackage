var feed  = require('./feed');

function WorkloadSchedulerService(rawLog, logger) {

	var server = undefined;
	
	var handleRequest = function (err, msg, res) {
		console.log ("handleResponse...");
		console.dir (err);
		console.dir (msg);
		var output = '';
		var errorCode=0;
		var result={};
		if (msg) {
			if (typeof msg == "string") {
				output += msg;
			}else{
				output += JSON.stringify(msg);
			}
			errorCode = 200;
			result = { 'result' : { 'msg' : output } };
		} else if (err) {
			if (typeof err == "string") {
				output += err;
			}else{
				output += JSON.stringify(err);
			}
			errorCode = 500;
			result = { 'error' : output};
		}
		console.log('workload scheduler feed: Message invoking provider: ', output);
		res.status(errorCode).json(result);
	};

	/**
	 * Starts the server.
	 *
	 * @param app express app
	 */
	this.start = function start(app) {
		server = app.listen(app.get('port'), function() {
			var host = server.address().address;
			var port = server.address().port;
			logger.info('[start] listening at http://%s:%s', host, port);
		});
	};

	/**
	 * req.body = { main: String, code: String, name: String }
	 */
	this.initCode = function initCode(req, res) {
		console.log('initCode...');
		try {
			var body = req.body || {};
			console.log(JSON.stringify(body));
			logger.info('[initCode]', body);
			res.status(200).json({});
		} catch (e) {
			logger.error('[initCode]', 'exception', e);
			console.log('initCode: error '+ JSON.stringify(e));
			res.status(500).json(e);
		}
	};

	/**
	 * req.body = { value: Object, meta { activationId : int } }
	 */
	this.runCode = function runCode(req, res) {
		console.log ("runCode...");
		var value = (req.body || {}).value;
		console.log(JSON.stringify(value));
		if (value.lifecycleEvent === 'CREATE') {
			feed.create(value, function (err,msg){
				handleRequest(err,msg,res);
			}.bind(this));
		} else if (value.lifecycleEvent === 'DELETE') {
			feed.remove(value, function (err,msg){
				handleRequest(err,msg,res);
			}.bind(this));
		} else handleRequest('Invalid lifecycle event',false,res);
	};
}

WorkloadSchedulerService.getService = function(rawLog, logger) {
	return new WorkloadSchedulerService(rawLog, logger);
};

module.exports = WorkloadSchedulerService;

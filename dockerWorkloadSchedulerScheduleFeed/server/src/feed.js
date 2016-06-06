var ws = require('iws-light');
var url = require("url");
var defaultLibraryName = 'OpenWhisk Feeds - ';
var defaultEngineName = 'engine';
var defaultEngineOwner = 'engine';
var defaultPort = '443';
var defaultProdApiHost = 'openwhisk.ng.bluemix.net';
var defaultStagApiHost = 'openwhisk.stage1.ng.bluemix.net';

function requireCondition( cond, message ) {
	if( ! cond ) {
		throw new Error( message );
	}
}

function requireOption( options, id, type ) {
	requireCondition( options, "Missing required options" );
	requireCondition( options.hasOwnProperty(id), "Missing required option '" + id + "'" );   
	if( type ) {
		requireCondition( typeof options[id] == type, "Option '" + id + "' must be of type " + type );
	}
}

function parseTrigger(options) {
	console.log ("parseTrigger...");

	var parsed = {};
	var delimiter = '/';
	var defaultNamespace = '_';
	if (options.triggerName && options.triggerName.charAt(0) === delimiter) {
		var parts = options.triggerName.split(delimiter);
		parsed.namespace = parts[1];
		parsed.name = parts.length > 2 ? parts.slice(2).join(delimiter) : '';
	} else {
		parsed.namespace = defaultNamespace;
		parsed.name = options.triggerName;
	}
	parsed.payload = options.trigger_payload || '';
	return parsed;
}

function parseRestHomeURL( restHomeURL ) {
	var parsedUrl = url.parse( restHomeURL, true );

	var conn = {
			hostname: parsedUrl.hostname,
			port: parsedUrl.port,
			pathname: parsedUrl.pathname,
			engine_name: parsedUrl.query.engineName,
			engine_owner: parsedUrl.query.engineOwner,
			tenancy: parsedUrl.query.tenantId
	};

	if( parsedUrl.auth ) {
		var auth = parsedUrl.auth.split(":");
		conn.userId = auth[0];
		conn.password = auth[1];
	}

	return conn;
}

/**
 * Parser of the input parameters.
 * Exported options:
 * 	'agent' Workload Scheduler agent name
 * 	'connection' Workload Scheduler bluemix connection url object
 * 	'base_rule' cron rule to scheduler trigger firing (for CREATE)
 * 	'trigger' Trigger information object
 * 	'whisk_user' OpenWhisk username
 * 	'whisk_password' OpenWhisk user password
 * 	'feed_library' Workload Scheduler library name
 */
function parseAllOptions(options,operation) {
	console.log ("parseAllOptions...");

	var parsed = {};
	var connOpts = {};

	// Parse feed options
	// The user has two options, or provides url value as specified in the
	// VCAP_SERVICES for Workload Scheduler bluemix service
	// or instead provides all the needed options to connect to the bluemix service
	if (options.hasOwnProperty("url")){
		requireOption( options, "url", "string" );		
		connOpts = parseRestHomeURL(options.url);
	}else{
		connOpts = JSON.parse(JSON.stringify(options));
	}

	// Parse mandatory connection parameters
	requireOption( connOpts, "hostname", "string" );
	requireOption( connOpts, "tenancy", "string" );
	requireOption( connOpts, "userId", "string" );
	requireOption( connOpts, "password", "string" );

	// Parse optional connection parameters
	connOpts.engine_name = defaultEngineName;
	connOpts.engine_owner = defaultEngineOwner;
	connOpts.port = defaultPort;
	if (connOpts.hasOwnProperty('engine_name')){
		connOpts.engine_name = connOpts.engine_name;
	}
	if (connOpts.hasOwnProperty('engine_owner')){
		connOpts.engine_owner = connOpts.engine_owner;
	}
	if (connOpts.hasOwnProperty('port')){
		connOpts.port = connOpts.port;
	}		

	// Create WS bluemix service connection url option
	parsed.connection = {
			url: 'https://' + encodeURIComponent(connOpts.userId) + ':' + encodeURIComponent(connOpts.password) + '@' + connOpts.hostname + ':' + connOpts.port + '/ibm/TWSWebUI/Simple/rest?tenantId=' + connOpts.tenancy + '&engineName=' + connOpts.engine_name + '&engineOwner=' + connOpts.engine_owner
	};

	// Retieve agent name
	parsed.agent = options.agent || connOpts.tenancy+'_CLOUD';

	if (operation && operation === 'CREATE') {
		requireOption( options, "base_rule", "string" );
		parsed.base_rule=options.base_rule;
	}

	// Parse whisk trigger name, workspace, payload
	parsed.trigger = parseTrigger(options);

	// Parse open whisk credentials from feed options
	parsed.whisk_user =  options.authKey.split(':')[0];
	parsed.whisk_password =  options.authKey.split(':')[1];

	// Retrieve Library name
	parsed.feed_library = options.feed_library || defaultLibraryName+parsed.trigger.namespace;
	return parsed;
}

/**
 * Create and Enable WS Process
 */
function createProcess(process, parameters, conn, callback){
	console.log ("createProcess...");
	conn.createProcess(process, function(err, data) {
		if (err){
			console.log ("createProcess: ERROR creating the process...");
			callback(err);
		} else {
			console.log ("createProcess: the process was created, enabling it...");
			conn.enableDisableProcess(data, true, function(err2) {
				if (err2){
					console.log ("createProcess: ERROR enabling the process...");
					callback(err2);
				} else {
					console.log ("createProcess: process created...");
					callback();
				}
			}.bind(this));
		}
	}.bind(this));
}

/**
 * Disable and Remove WS Process
 */
function deleteProcess(process, parameters, conn, callback){
	console.log ("deleteProcess...");
	conn.enableDisableProcess(process, false, function(err) {
		if (err){
			console.log ("deleteProcess: ERROR disabling the process...");
			callback(err);
		} else {
			console.log ("deleteProcess: the process was disabled, deleting it...");
			conn.deleteProcess(process, function(err2) {
				if (err2){
					console.log ("deleteProcess: ERROR deleting the process...");
					callback(err2);
				} else {
					console.log ("deleteProcess: process deleted...");
					callback();
				}
			}.bind(this));
		}
	}.bind(this));
}

/**
 * Look for a specific WS Process inside a library and delete it
 */
function searchAndDeleteProcess(library, parameters, conn, callback){
	console.log ("searchAndDeleteProcess...");

	var procFound = false;

	// Retrieve the right WS Process specific to the trigger name
	conn.getProcesses(library, function (err, processes) {
		if(err){
			console.log ("searchAndDeleteProcess: ERROR getting the processes...");
			callback(err);
		} else {
			for (var i = 0; i < processes.length; i++) {
				var process = processes[i];
				if (process.name.toLowerCase() == parameters.trigger.name.toLowerCase()) { // Open whisk process is found
					procFound = true;
					console.log ("searchAndDeleteProcess: process was found deleting it...");
					// Disable and Remove WS Process
					deleteProcess(process, parameters, conn, function (err2) {
						if (err2){
							callback(err2);
						} else {
							callback();
						}
					}.bind(this));
					break;
				}
			}
			if (!procFound){
				console.log ("searchAndDeleteProcess: WARNING the process was not found...");
				callback();				
			}
		}
	}.bind(this));
}

function Feed() {
}

/**
 * Implementation of the CREATE Feed Lifecycle
 */
Feed.create = function(options,callback){

	console.log ("Feed.create...");
	console.dir (options);

	// Parse and retrieve all options
	var parameters = parseAllOptions(options,'CREATE');
	console.dir (parameters);

	// Create WS connection
	var wsConn = ws.createConnection(parameters.connection);

	// Create WS Process
	var wsProcess = new ws.WAProcess(parameters.trigger.name);

	// Create WS Step
	var wsStep = new ws.steps.OpenWhiskStep(parameters.agent);
	var props = {"hostname" : defaultProdApiHost, "userName" : parameters.whisk_user, "password": parameters.whisk_password, "namespace": parameters.trigger.namespace};
	var wsStepParameters= {"triggerName" : parameters.trigger.name, "payload": parameters.trigger.payload};
	wsStep.setConnection(props);
	wsStep.setFireTriggerOperation(wsStepParameters);

	// Add WS Step and configure WS runcycles rules for WS Process
	wsProcess.addStep( wsStep );
	wsProcess.addTrigger( ws.TriggerFactory.fromCron(parameters.base_rule) );

	// Retrieve openwhisk library
	var procLibFound = false;
	wsConn.getProcessLibraries({}, function (err, processLibraries) {
		if(err){
			console.log('Feed.create: ERROR getting process libraries...');
			callback(err);
		} else {
			for (var i = 0; i < processLibraries.length; i++) {
				var processLibrary = processLibraries[i];
				if (processLibrary.name.toLowerCase() == parameters.feed_library.toLowerCase()) { // Open whisk library is found
					procLibFound = true;

					// Look for a specific process name inside a library and delete it
					searchAndDeleteProcess(processLibrary, parameters, wsConn, function (err2) {
						if (err2){
							callback(err2);
						} else {
							// Assign openwhisk process library id to WS Process
							wsProcess.tasklibraryid = processLibrary.id;

							// Create and Enable WS Process
							createProcess(wsProcess, parameters, wsConn, function (err3) {
								if (err3){
									callback(err3);
								} else {
									callback(null,'WS Process was enabled to fire whisk trigger '+ parameters.trigger.name);
								}
							}.bind(this));
						}
					}.bind(this));

					break;
				}
			}
			if (!procLibFound) { // Open whisk library was not found
				// Create openwhisk library
				wsConn.createProcessLibrary( { name: parameters.feed_library}, function (err2, processLibrary) {
					if (err2) {
						console.log('Feed.create: ERROR creating process library...');
						callback(err2);
					}else{
						// Assign openwhisk process library id to WS Process
						wsProcess.tasklibraryid = processLibrary.id;

						// Create and Enable WS Process
						createProcess(wsProcess, parameters, wsConn, function (err3) {
							if (err3){
								callback(err3);
							} else {
								callback(null,'WS Process was enabled to fire whisk trigger '+ parameters.trigger.name);
							}
						}.bind(this));
					}
				}.bind(this));
			}
		}
	}.bind(this));
};

/**
 * Implementation of the DELETE Feed Lifecycle
 */
Feed.remove = function(options,callback){

	console.log ("Feed.remove...");
	console.dir (options);

	// Parse and retrieve all options
	var parameters = parseAllOptions(options,'DELETE');
	console.dir (parameters);

	// Create WS connection
	var wsConn = ws.createConnection(parameters.connection);

	// Retrieve openwhisk library
	var procLibFound = false;
	wsConn.getProcessLibraries({}, function (err, processLibraries) {
		if(err){
			console.log('Feed.remove: ERROR getting process libraries...');
			callback(err);
		} else {
			for (var i = 0; i < processLibraries.length; i++) {
				var processLibrary = processLibraries[i];
				if (processLibrary.name.toLowerCase() == parameters.feed_library.toLowerCase()) { // Open whisk library is found
					procLibFound = true;

					// Look for the specific process name inside a library and delete it
					searchAndDeleteProcess(processLibrary, parameters, wsConn, function (err2) {
						if (err2){
							callback(err2);
						} else {
							callback(null,'WS Process ' + parameters.trigger.name + ' was deleted');
						}
					}.bind(this));

					break;
				}
			}
			if (!procLibFound) { // Open whisk library was not found
				console.log('Feed.remove: WARNING Unable to find the OpenWhisk Workload Scheduler Process Library...');
				callback(null,'WS Process ' + parameters.trigger.name + ' was deleted');
			}
		}
	}.bind(this));
};

module.exports = Feed;

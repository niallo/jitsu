/*
 * logs.js: Commands related to user resources
 *
 * (C) 2010, Nodejitsu Inc.
 *
 */

var jitsu = require('../../jitsu'),
    dateformat = require('dateformat'),
    logs = exports,
    utile = jitsu.common;

logs.usage = [
  'The `jitsu logs` command will display logs related to the app',
  'The default number of lines to show is 10',
  '',
  'Example usages:',
  'jitsu logs all',
  'jitsu logs all <number of lines to show>|stream|follow',
  'jitsu logs app <app name>',
  'jitsu logs app <app name> <number of lines to show>|stream|follow'
];

//
// ### function all (callback)
// #### @callback {function} Continuation to pass control to when complete.
// Queries the log API and retrieves the logs for all of the user's apps
//
logs.all = function (amount, callback) {
  //
  // Allows arbitrary amount of arguments
  //
  if(arguments.length) {
    var args = utile.args(arguments);
    callback = args.callback;
    amount  = args[0] || null;
  }

  if (!amount) {
    amount = 10;
  }

  if (amount === 'stream' || amount === 'follow') {
    var stream = jitsu.logs.streamByUser(jitsu.config.get('username'));
    return putStream(stream, callback);
  }

  jitsu.logs.byUser(jitsu.config.get('username'), amount, function (err, results) {
    if (err) {
      return callback(err);
    }

    var apps = {};

    results.forEach(function (log) {
      apps[log.app] = apps[log.app] || [];
      apps[log.app].push(log);
    });

    if (apps.length === 0) {
      jitsu.log.warn('No logs for ' + jitsu.config.get('username').magenta + ' from timespan');
      return callback();
    }

    function sortLength (lname, rname) {
      var llength = apps[lname].length,
          rlength = apps[rname].length;

      if (llength === rlength) {
        return 0;
      }

      return llength > rlength ? 1 : -1;
    }

    Object.keys(apps).sort(sortLength).forEach(function (app) {
      console.log('App: '.grey + app.magenta);
      putLogs(apps[app], app, amount, true);
    });

    callback();
  });
};

logs.all.usage = [
  'Print the logs from all applications. The default number of',
  'lines to show is 10.',
  'jitsu logs all <number of lines to show>|stream|follow',
  '',
  'Example usage:',
  'jitsu logs all',
  'jitsu logs all 5',
  'jitsu logs all stream',
  'jitsu logs all follow'
];

//
// ### function app (appName, callback)
// #### @appName {string} the application to get the logs for
// #### @callback {function} Continuation to pass control to when complete.
// Queries the log API and retrieves the logs for the specified application
//
logs.app = function (appName, amount, callback) {
  //
  // This is defined so that it can get called once all the arguments are
  // sorted out.
  //

  //
  // Allows arbitrary amount of arguments
  //
  if(arguments.length) {
    var args = utile.args(arguments);
    callback = args.callback;
    appName  = args[0] || null;
    amount   = args[1] || null;
  }

  function byApp(appName, amount, callback) {
    if (amount === 'stream' || amount === 'follow') {
      var stream = jitsu.logs.streamByApp(appName);
      return putStream(stream, callback);
    }

    jitsu.logs.byApp(appName, amount, function (err, results) {
      if (err) {
        return callback(err);
      }

      jitsu.log.info('Listing logs for ' + appName.magenta);
      putLogs(results, appName, amount);
      callback();
    });
  }

  function getAppName(callback) {
    jitsu.package.read(process.cwd(), function (err, pkg) {
      if (!err) {
        jitsu.log.info('Attempting to load logs for ' + (process.cwd()+ '/package.json').grey);
        return callback(null, pkg.name);
      }
      callback(err);
    });
  }

  amount = amount || 100;

  if (!appName) {
    getAppName(function (err, name) {
      if (err) {
        jitsu.commands.list(function(){
          jitsu.log.info('Which application to view ' + 'logs'.magenta + ' for?');
          jitsu.prompt.get(["app name"], function (err, result) {
            if (err) {
              jitsu.log.error('Prompt error:');
              return callback(err);
            }
            appName = result["app name"];
            byApp(appName, amount, callback);
          });
        })
      } else {
        byApp(name, amount, callback);
      }
    });
  } else {
     byApp(appName, amount, callback);
  }

}

logs.app.usage = [
  'Print the logs from specified application. The default number of',
  'lines to show is 10.',
  'jitsu logs app <app name> <number of lines to show>|stream|follow',
  '',
  'Example usage:',
  'jitsu logs app test',
  'jitsu logs app test 40',
  'jitsu logs app test stream',
  'jitsu logs app test follow'
];

//
// ### function putLogs (results, appName, amount, showApp)
// #### @results {Object} Logs object to output.
// #### @appName {string} App name associated with the log text.
// #### @showApp {boolean} Value indicating if the app name should be output.
// Parses, formats, and outputs the specified `results` to the user.
// TODO: utilize amount and showApp
//
function putLogs (results, appName, amount, showApp) {
  //
  // Allows arbitrary amount of arguments
  //
  if(arguments.length) {
    var args = utile.args(arguments);
    results  = args[0] || null;
    appName  = args[1] || null;
    amount   = args[2] || null;
    showApp  = args[3] || null;
  }

  if (!Array.isArray(results)) results = [results];

  results = results.filter(function (item) {
    return item.message != null;
  });

  if (results.length === 0) {
    return jitsu.log.warn('No logs for ' + appName.magenta + ' in specified timespan');
  }

  var logLength = jitsu.config.get('loglength'),
      logged = 0;

  function sort(first, second) {
    return new Date(first.timestamp) - new Date(second.timestamp);
  }

  results.sort(sort).forEach(function (log) {
    log.message.split('\n').forEach(function (line) {
      var now = new Date(log.timestamp);
      now = dateformat(now, "mm/dd HH:MM:ss Z");
      if (line.length) {
        console.log('[' + now.toString().yellow + '] ' + line);
      }
    });
  });
}

//
// ### function putStream (stream, callback)
// #### @stream {stream} Log stream.
// #### @callback {function} Callback to execute on completion.
// Outputs data from a log stream.
//
function putStream(stream, callback) {
  stream.on('log', function (log) {
    putLogs(log, log.app);
  });
  return stream;
}

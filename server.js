// DO NOT EDIT THIS FILE, unless you know what you are doing.

// Load config
var config = require('./config');

// Load web app
var express = require('express');
var path = require('path');
var app = express();
var http = require('http').Server(app);

// Load milight and others
var Milight;
var commands;
var light;
var zone = 0;

// ejs
console.log("Setting up EJS...");
app.set('views', __dirname + '/views');
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'ejs');

// Keeping state of lights
var moodMode = false;
var moodCounter = 50;
var moodInterval = null;
var moodIncrement = false;
var MOOD_MAX = 50;
var MOOD_MIN = 0;
var MOOD_INTERVAL_MS = 1000;
var MOOD_CHANGE_PER_INT = 1; // MUST BE 1, because user can choose hue of any multiple of 1!

// Updates
var UPDATE_CHECK_INTERVAL_MS = 1 * 60 * 60 * 1000; // Default: every hour
var updateAvailable = false;

// Keeps last CCT value
// TODO array of CCT per zone
var cct = 0;

// Keep lightsOn state by zone inside an array
var lightsOn = [];
for(i = 0; i < 5; i++)
{
	lightsOn[i] = false;
}

var lastHue = -1;

// Don't force check updates cache as it will make page load slower
app.get('/', function(req, res) {
	res.render('index.html', { zones: config.zones,
														hasNewVersion: hasNewVersion(false) });
});

// TODO
app.get('/update', function(req, res) {
	var lastCommit = getLastCommitId();
	var latestVersion = getLatestVersionId();
	res.render('update.html', { version: lastCommit,
														 latestVersion: latestVersion,
													   hasNewVersion: hasNewVersion(true) });
});

// Force update cache on about page, it's fine for it to be slower
app.get('/api', function(req, res) {
	var lastCommit = getLastCommitId();
	var latestVersion = getLatestVersionId();
	res.render('about.html', { version: lastCommit,
														 latestVersion: latestVersion,
													   hasNewVersion: hasNewVersion(true) });
});

app.get('/disco', function(req, res) {
	res.render('disco.html', { zones: config.zones });
});

app.get('/mood', function(req, res) {
	res.render('mood.html');
});

app.get('/alarm', function(req, res) {
	res.render('alarm.html', { zones: config.zones });
});


///////////////////
// API FUNCTIONS //
///////////////////

// mood mode
app.get('/api/mood', function(req, res) {
	console.log("Mood mode");

	// Set min and max hues
	MOOD_MIN = parseInt(req.query.start);
	MOOD_MAX = parseInt(req.query.end);
	moodCounter = MOOD_MIN;
	moodIncrement = true;
	console.log("Mood min: " + MOOD_MIN + " - max: " + MOOD_MAX);

	if(moodMode)
	{
		console.log("Turn off mood mode");

		if(moodInterval != null)
		{
			clearInterval(moodInterval);

			// Reset to white colour
			light.sendCommands(commands.fullColor.whiteTemperature(zone, cct), commands.rgbw.whiteMode(zone));
		}

		moodMode = false;
	}
	else {
		console.log("Turn on mood mode");
		light.sendCommands(commands.fullColor.on(zone), commands.rgbw.on(zone));
		moodInterval = setInterval(doMood, MOOD_INTERVAL_MS);
		moodMode = true;
	}

	res.send();
});

function doMood() {
	if(moodIncrement)
	{
		moodCounter += MOOD_CHANGE_PER_INT;
	}
	else
	{
		moodCounter -= MOOD_CHANGE_PER_INT;
	}

	// Set hue direction
	if(moodCounter == MOOD_MIN)
	{
		moodIncrement = true;
	}
	else if(moodCounter == MOOD_MAX)
	{
		moodIncrement = false;
	}

	console.log("domood(): set hue to " + moodCounter + " (D) Increment next time? " + moodIncrement);

	light.sendCommands(commands.fullColor.hue(zone, moodCounter), commands.rgbw.hue(zone, moodCounter));
}

app.get('/api/toggle', function(req, res) {
	if(lightsOn[zone] == true)
	{
		console.log("Turn off (toggle)");
		light.sendCommands(commands.fullColor.off(zone), commands.rgbw.off(zone), commands.white.off(zone));
	}
	else {
		console.log("Turn on (toggle)");
		light.sendCommands(commands.fullColor.on(zone), commands.rgbw.on(zone), commands.white.on(zone));
	}

	lightsOn[zone] = !lightsOn[zone];
	res.send();
});

app.get('/api/start_alarm', function(req, res) {
	alarmAt = req.query.wakeUpAt;
	minutesToAlarm = req.query.startAt;
	startAlarm();
});

app.get('/api/test_alarm', function(req, res) {
	console.log("Test alarm");
	testAlarm();
	res.send();
});

// TODO
app.get('/api/last_hue', function(req, res) {
	console.log("GET Last hue");
	//light.sendCommands(commands.fullColor.effectModeNext(zone));
	//light.sendCommands(commands.rgbw.effectModeNext(zone));
	res.send();
});


app.get('/api/mode', function(req, res) {
	console.log("Next mode");
	light.sendCommands(commands.fullColor.effectModeNext(zone));
	light.sendCommands(commands.rgbw.effectModeNext(zone));
	res.send();
});

app.get('/api/mode_slow', function(req, res) {
	console.log("Mode slower");
	for(i = 0; i < 50; i++)
	{
		light.sendCommands(commands.fullColor.effectSpeedDown(zone));
		light.sendCommands(commands.rgbw.effectSpeedDown(zone));
	}
	res.send();
});

app.get('/api/mode_fast', function(req, res) {
	console.log("Mode faster");
	for(i = 0; i < 50; i++)
	{
		light.sendCommands(commands.fullColor.effectSpeedUp(zone));
		light.sendCommands(commands.rgbw.effectSpeedUp(zone));
	}
	res.send();
});

app.get('/api/turn_on', function(req, res) {
	console.log('Turn on');
	light.sendCommands(commands.fullColor.on(zone), commands.rgbw.on(zone), commands.white.on(zone));
	lightsOn[zone] = true;
	res.send();
});

app.get('/api/turn_off', function(req, res) {
	console.log('Turn off');
	light.sendCommands(commands.fullColor.off(zone), commands.rgbw.off(zone), commands.white.off(zone));
	lightsOn[zone] = false;
	res.send();
});

app.get('/api/night', function(req, res) {
	console.log('Night mode');
	light.sendCommands(commands.fullColor.nightMode(zone));
	res.send();
});

app.get('/api/zone', function(req, res) {
	zone = req.query.value;
	console.log('Set zone to: ' + zone);
	res.send();
});

app.get('/api/alarm_zone', function(req, res) {
	alarmZone = req.query.value;
	console.log('Set alarm zone to: ' + alarmZone);
	res.send();
});

app.get('/api/cct', function(req, res) {
	cct = req.query.value;
	console.log('Set temperature (CCT) to: ' + cct);
	light.sendCommands(commands.fullColor.whiteTemperature(zone, cct), commands.rgbw.whiteMode(zone));
	res.send();
});

app.get('/api/brightness', function(req, res) {

	var brightness = req.query.value;

	console.log('Set brightness to: ' + brightness + '%');
	light.sendCommands(commands.fullColor.brightness(zone, brightness), commands.rgbw.brightness(zone, brightness)); //, commands.white.brightness(zone, brightness));
	res.send();
});

app.get('/api/saturation', function(req, res) {
	var saturation = req.query.value;
	console.log('Set saturation to: ' + saturation + '%');
	light.sendCommands(commands.fullColor.saturation(zone, saturation));
	res.send();
});

app.get('/api/hue', function(req, res) {
	var hue = req.query.value;
	console.log('Set hue to: ' + hue);
	light.sendCommands(commands.fullColor.hue(zone, hue), commands.rgbw.hue(zone, hue));
	res.send();
});

app.get('/api/rand_hue', function(req, res) {
	var hue = Math.floor((Math.random() * 255) + 1); // Between 1 and 255
	console.log('Set RANDOM hue (' + hue + ')');
	light.sendCommands(commands.fullColor.hue(zone, hue));
	res.send();
});

var static_dir = path.join(__dirname, 'bootstrap');
app.use('/bootstrap', express.static(static_dir));
static_dir = path.join(__dirname, 'js');
app.use('/js', express.static(static_dir));
http.listen(config.nodejs_port, function() {
	console.log('Initialising Milight bridge connection (version ' + config.bridge_version + ')');
	initIBox();
	console.log('Setting up port ' + config.nodejs_port);
	console.log('milights-bridge is ready, please open your browser at http://' + getCurrentIP() + ':' + config.nodejs_port);
});

function getCurrentIP()
{
	var ip = require("ip");
	return ip.address();
}

function initIBox() {
	Milight = require('./node_modules/node-milight-promise/src/index').MilightController;
	commands = require('./node_modules/node-milight-promise/src/index').commandsV6;

	light = new Milight({
	    ip: config.bridge_ip, //"255.255.255.255",
	    type: config.bridge_version
	});

	// Check for updates on startup
	// As well as every X ms (see interval variable)
	refreshUpdateCache();
	setInterval(refreshUpdateCache, UPDATE_CHECK_INTERVAL_MS);
}

/********* ALARM FUNCTIONS ********/
// -- EXTERNAL --
var alarmAt = 0;
var minutesToAlarm = 30;
var alarmZone = 1;

// -- INTERNAL --
// -- Depends on alarm setting, do not touch --
// There are 100 events -- so
// 30 min / 100 events => x MIN there is an event (brightnes++ and colour change)
var msBetweenTimeout = 0;
// In order to cancel timeout if needed
var alarmTimeout = null;
var alarmBrightness = 0; // Percent
var alarmSet = false;
var testMode = false;

function testAlarm() {
	testMode = true;
	alarmAt = new Date().getTime() + minsToMs(1);
	minutesToAlarm = 1;
	startAlarm();
	testMode = false;
}

function startAlarm() {
	if(alarmSet)
	{
		console.log("FAIL. Alarm already set.");
		return;
	}
	alarmSet = true;

	console.log('alarmAt: ' + alarmAt + ' minutesToAlarm: ' + minutesToAlarm + ' alarmZone: ' + alarmZone + ' Server time: ' + new Date());
	alarmBrightness = 0;
	dimAndTurnOn();
	// Calculate the timeout between updates
	// To be used in alarmCallback();
	var timeout = 10;
	if(!testMode)
	{
		calcMsTimeout();
		timeout = getAlarmDelayFromNow();
	}
	console.log("Timeout to start alarm brightness cycles: " + timeout);
	setTimeout(alarmCallback, timeout); ///60000);
}

function dimAndTurnOn() {
	// Make sure the light turns on with 0 brightness and in white mode
	light.sendCommands(commands.fullColor.whiteTemperature(alarmZone, 20));
	light.sendCommands(commands.fullColor.brightness(alarmZone, 0));
	light.sendCommands(commands.fullColor.on(alarmZone));
	light.sendCommands(commands.fullColor.whiteTemperature(alarmZone, 20));
	light.sendCommands(commands.fullColor.brightness(alarmZone, 0));

	// Repeat for any other lights
	light.sendCommands(commands.white.on(alarmZone));
	for(i = 0; i < 10; i++) // White lights have only ten steps and no setTo(X) command
	{
		light.sendCommands(commands.white.warmer(alarmZone));
		light.sendCommands(commands.white.brightDown(alarmZone));
	}

	// Repeat for any other lights
	light.sendCommands(commands.rgbw.brightness(alarmZone, 0));
	light.sendCommands(commands.rgbw.on(alarmZone));
	light.sendCommands(commands.rgbw.brightness(alarmZone, 0));


}

function alarmCallback() {
	console.log("AlarmCallback()");
	alarmBrightness++;

	light.sendCommands(commands.fullColor.brightness(alarmZone, alarmBrightness),
										commands.rgbw.brightness(alarmZone, alarmBrightness));

  // White lights have only ten steps and no setTo(X) command
	// So instead, for every 10%, make it brighter.
  if((alarmBrightness % 10) == 0)
	{
		light.sendCommands(commands.white.brightUp(alarmZone));
	}

	if(alarmBrightness < 101)
	{
		console.log("Incremented brightness to: " + alarmBrightness);
		setTimeout(alarmCallback, msBetweenTimeout);
	}
	else
	{
		console.log("Alarm finished.");
		alarmSet = false;
	}
}

function calcMsTimeout() {
	// Calculate timeout in mins
	msBetweenTimeout = minutesToAlarm / 100;

	// Mins to ms
	msBetweenTimeout = minsToMs(msBetweenTimeout);

	console.log("msBetweenTimeout: " + msBetweenTimeout);
}

function getAlarmToMs() {
	alarmAt = alarmAt + '';
	var hour = alarmAt.substring(0, 2);
	var mins = alarmAt.substring(3, 5);

	return minsToMs(hour*60) + minsToMs(mins);
}

function getAlarmStartTimeMs() {
	// Alarm finished ms - (minsToAlarm to MS)
	return getAlarmToMs() - minsToMs(minutesToAlarm);
}


function getAlarmStartInUnix() {
	console.log("test");
	var startMs = getAlarmStartTimeMs();
	// Today at midnight + start time (ms)
	var d = new Date();
	d.setHours(0,0,0,0);
	var startUnix = d.getTime() + startMs;

	if(startUnix < new Date().getTime())
	{
		// The alarm is meant to be set for tomorrow!
		d = new Date();
		d.setDate(d.getDate() + 1); // set to tomorrow
		d.setHours(0,0,0,0);

		startUnix = d.getTime() + startMs;
	}

	console.log("Alarm start unix detected: " + startUnix);

	return startUnix;
}

function getAlarmDelayFromNow() {
	// From date timestamp
	// To delay in ms
	var delay = getAlarmStartInUnix();
	delay -= new Date().getTime();

	return delay;
}

function minsToMs(mins) {
	return mins * 60000;
}

// About page FUNCTIONS
function getLastCommitId() {
	var child_process = require('child_process');
	if (!child_process.execSync) {
		"Error cannot query Github - to be fixed in next release."
	}
	else {
		return child_process
			.execSync('git rev-parse HEAD')
			.toString().trim();
	}
}

function getLatestVersionId() {
	var child_process = require('child_process');
	if (!child_process.execSync) {
		"Error cannot query Github - to be fixed in next release."
	}
	else {
		return child_process
		.execSync('git ls-remote  https://github.com/KevinVR/milights-bridge.git HEAD')
		.toString().trim()
		.split(" ")[0];
	}
}

function refreshUpdateCache()
{
	console.log("Checking for updates...");
	var local = getLastCommitId();
	var remote = getLatestVersionId();

	// Add to cache
	updateAvailable = (local != remote);
}

function hasNewVersion(forceCache)
{
	if(forceCache)
	{
		refreshUpdateCache();
	}

	return updateAvailable;
}

// mood FUNCTIONS
// function playmoodMusic()
// {
// 	require('child_process')
// 	.exec("castnow ");
// }

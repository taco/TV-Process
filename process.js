var PROCESS_DIR = '/Volumes/Media/Video/TV Shows';
var STATES = {
	queued: '~{QUEUED}~',
	processing: '~{PROCESSING}~',
	completed: '~{COMPLETED}~',
	failed: '~{FAILED}~'
};
var STATE_PRIORITY = [
	'queued',
	'processing',
	'completed',
	'failed'
];

var finder = require('findit')(PROCESS_DIR);
var path = require('path');
var argv = require('optimist').argv;

var files = [];


var File = function(p) {
	this.path = p
	this.dir = path.dirname(this.path)
	this.ext = path.extname(this.path)
	this.file = path.basename(this.path, this.ext)
	this.file = this.initState()
	console.log(this.state(), this.path);
}

File.prototype.stateStr = function() {
	return STATES[this.state()];
}

File.prototype.state = function(val) {
	if (typeof val !== 'undefined') return this._setState()
	return this._getState()
}

File.prototype._setState = function(val) {
	this._state = val;
	return this;
}

File.prototype._getState = function() {
	return this._state;
}

File.prototype.initState = function() {
	var keys = Object.keys(STATES);

	for(var i = 0; i < keys.length; i++) {
		//console.log(STATES[keys[i]], this.file);
		if (this.file.match(STATES[keys[i]])) {
			this._state = keys[i];
			this.file.replace(this.stateStr(), '');
			return;
		}
	}

	this._state = 'init';
}

File.prototype.removeState = function(state) {
	this._state = state;
	this.file = this.file.replace(STATES[state], '');
}

File.prototype.source = function() {
	return this.dir + '/' + this.stateStr() + this.file + this.ext
}

finder.on('file', function(file, stat) {
	files.push(new File(file))
});


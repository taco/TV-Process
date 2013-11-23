var PROCESS_DIR = '/Volumes/Media/Video/TV Shows'
var STATES = {
	queued: '~{3-QUEUED}~',
	processing: '~{2-PROCESSING}~',
	completed: '~{1-COMPLETED}~',
	failed: '~{0-FAILED}~'
}

var watchTimeouts = {}

var finder = require('findit')(PROCESS_DIR)
var path = require('path')
var argv = require('optimist').argv
var fs = require('fs')
var exec = require('child_process').exec

var files = []

var log = function(cmd) {
	var args = Array.prototype.slice.call(arguments, 1),
		timestamp = new Date().toLocaleString().substr(0, 24)

	cmd = cmd.toUpperCase() + (args.length ? ':' : '')
	args = Array.prototype.concat.apply([timestamp, cmd], args)

	console.log.apply(console, args)
}






var File = function(p) {
	this.path = p
	this.dir = path.dirname(this.path)
	this.ext = path.extname(this.path)
	this.file = path.basename(this.path, this.ext)
	this.initState()
}

File.prototype.stateStr = function() {
	return STATES[this.state()]
}

File.prototype.state = function(val) {
	if (typeof val !== 'undefined') return this._setState(val)
	return this._getState()
}

File.prototype._setState = function(val) {
	var oldPath = this.path,
		newPath

	if (val === this._state) return
	
	this._state = val

	newPath = this.source()

	fs.renameSync(oldPath, newPath)

	this.path = newPath

	return this
}

File.prototype._getState = function() {
	return this._state
}

File.prototype.initState = function() {
	var keys = Object.keys(STATES)

	for(var i = 0; i < keys.length; i++) {
		if (this.file.match(STATES[keys[i]])) {
			this._state = keys[i]
			this.file = this.file.replace(this.stateStr(), '')
			return
		}
	}

	this._state = 'init'
}

File.prototype.removeState = function(state) {
	this._state = state
	this.file = this.file.replace(STATES[state], '')
}

File.prototype.source = function() {
	return this.dir + '/' + (this.stateStr() || '') + this.file + this.ext
}

File.prototype.dest = function() {
	return this.dir + '/' + this.file + '.m4v'
}

File.prototype.queue = function(start) {
	if (this.state() !== 'init') {
		log('skip', this.state(), this.file)
		return
	}
	if (this.ext !== '.mkv' && this.ext !== '.avi') {
		log('skip', this.ext, this.file)
		return
	}
	
	this.state('queued')
	log('queue', this.ext, this.file)
	Controller.queue(this, start)
}

File.prototype.remove = function() {
	var me = this

	fs.unlink(this.source(), function(err) {
		if (err) {
			log('REMOVE ERROR', err)
			return
		}
		log('removed', me.state(), me.ext, me.file)
	})
}

File.prototype.process = function(i, len) {
	var me = this,
		watch = typeof i === 'boolean' && i === true
	
	if (watch) log('process watch', this.ext, this.file)
	else log('process ' + i + ' of ' + len, this.ext, this.file)
	
	this.state('processing')
	
	switch (this.ext) {
		
		case '.mkv':
			this.processMkv(watch)
			break
		
		case '.avi':
			this.processAvi(watch)
			break
	}
}

File.prototype.processMkv = function(watch) {
	var cmd = 'SublerCLI -source "' + this.source() + '" -64bitchunk -dest "' + this.dest() + '" -remove -optimize -itunesfriendly -downmix dolby',
		me = this

	exec(cmd, function(error, stdout, stderr) {
		if (error !== null) {
			log('processmkv error:', error)
			me.state('failed')
			!watch && Controller.next()
			return
		}
		me.state('completed')
		!watch && Controller.next()
	})
}

File.prototype.processAvi = function(watch) {
	var cmd = 'HandBrakeCLI -i "' + this.source() + '" -o "' + this.dest() + '" --preset="Normal"',
		me = this

	exec(cmd, function(error, stdout, stderr) {
		if (error !== null) {
			log('processavi error:', error)
			me.state('failed')
			!watch && Controller.next()
			return
		}
		me.state('completed')
		!watch && Controller.next()
	})
}









finder.on('file', function(file, stat) {
	files.push(new File(file))
})









var Controller = {
	
	init: function() {
		this._queue = []
		this._index = 0
		this._processing = false
	},

	clean: function(state) {
		log('========= CLEAN =========', state || 'all')
		
		files.forEach(function(file) {
			if (!state) {
				file.state('init')
				return
			}
			if (file.state() === state) file.state('init')
		})
	},

	process: function(show) {
		log('========= PROCESS =========', show || 'all')

		files.forEach(function(file) {
			if (!show) file.queue()
			else if (file.dir.match(show)) {
				file.queue()
			}
		})

		this.processing = true

		this.next()
	},

	list: function(show) {
		var count = 1

		log('========= LIST =========', show || 'all')

		this._queue = []
		this._index = 0

		files.forEach(function(file, i) {
			if (file.state() !== 'init' || (file.ext !== '.mkv' && file.ext !== '.avi')) return

			log('ready ' + count++, file.ext, file.file)
		})

		this.next()
	},

	remove: function(state) {
		log('========= REMOVE =========', state || 'none')

		files.forEach(function(file) {
			if (file.state() === state) file.remove()
		})
	},

	watch: function() {
		log('========= WATCHING =========')

		var f2 = require('findit')(PROCESS_DIR)

		f2.on('directory', function(dir) {
			log('watching', dir)
			fs.watch(dir, function(e, filename) {
				var p = dir + '/' + filename
				if (!filename.match(/.avi$/) && !filename.match(/.mkv$/) && !filename.match(/.rtf$/)) return
				clearTimeout(watchTimeouts[p])
				watchTimeouts[p] = setTimeout(function() {
					var file = new File(p)

					delete watchTimeouts[p]

					if (!fs.existsSync(p) || file.state() !== 'init') return;
					
					file.queue()

					Controller.processing()

				}, 1000 * 60)
			})
		})
	},

	queue: function(file) {
		if (!this._queue) this._queue = []

		this._queue.push(file)
	},

	next: function() {
		var file = this._queue[this._index]

		if (!file) {
			this._processing = false
			return
		}

		this._index++
		file.process(this._index, this._queue.length)
	},

	processing: function() {
		if (this._processing) return
		this._processing = true
		this.next()
	}

}






setTimeout(function() {
	
	Controller.init()

	if (argv.clean || argv.c) {
		
		var state
		
		if (typeof argv.clean === 'string') state = argv.clean
		else if (typeof argv.c === 'string') state = argv.c
		
		Controller.clean(state)

	} else if (argv.list || argv.l) {
		
		var show
		
		if (typeof argv.list === 'string') show = argv.list
		else if (typeof argv.l === 'string') show = argv.l
		
		Controller.list(show)

	} else if (argv.process || argv.p) {
		
		var show
		
		if (typeof argv.process === 'string') show = argv.process
		else if (typeof argv.p === 'string') show = argv.p
		
		Controller.process(show)

	} else if (argv.remove || argv.r) {
		var state
		
		if (typeof argv.remove === 'string') state = argv.remove
		else if (typeof argv.r === 'string') state = argv.r

		Controller.remove(state)

	} else if (argv.watch || argv.w) {
		
		Controller.watch()

	}

}, 500)
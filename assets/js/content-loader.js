/*
	Content loader
	------------------------------------------------------------------
	Reads files from folders in this repository through the GitHub API
	and renders them into the page:

		content/左侧信息/    -> sidebar text + avatar image
		content/个人信息/    -> profile text
		content/个人作品/    -> (later) one sub folder per work item

	Supported file types inside a folder:
		.txt .md            rendered as text (blank line = new paragraph)
		.jpg .png .gif ...  rendered as an image
		.mp4 .webm .mov ... rendered as a video

	So content can be updated by editing/uploading files only,
	without touching index.html.
*/

(function(window, document) {

	var	REPO = '525906274/Zihao.github.io',
		BRANCH = 'main',
		CACHE_KEY = 'site_content_cache',
		CACHE_TTL = 10 * 60 * 1000;

	var	TEXT_EXT = ['txt', 'md'],
		IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
		VIDEO_EXT = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v'];

	function extension(name) {
		var i = name.lastIndexOf('.');
		return (i < 0 ? '' : name.substring(i + 1).toLowerCase());
	}

	function kindOf(name) {
		var e = extension(name);

		if (IMAGE_EXT.indexOf(e) >= 0) return 'image';
		if (VIDEO_EXT.indexOf(e) >= 0) return 'video';
		if (TEXT_EXT.indexOf(e) >= 0) return 'text';

		return null;
	}

	function byName(a, b) {
		return (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
	}

	// Bypass the browser/CDN cache so file edits show up right away.
	function bust(url) {
		return url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now();
	}

	function readCache() {
		try {
			var c = JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null');
			if (c && c.time && (Date.now() - c.time) < CACHE_TTL)
				return c.folders || {};
		}
		catch (e) {}

		return {};
	}

	function writeCache(folders) {
		try {
			window.localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), folders: folders }));
		}
		catch (e) {}
	}

	function fetchJSON(url) {
		return fetch(url).then(function(r) {
			if (!r.ok) throw new Error('HTTP ' + r.status);
			return r.json();
		});
	}

	function fetchText(url) {
		return fetch(url).then(function(r) {
			if (!r.ok) throw new Error('HTTP ' + r.status);
			return r.text();
		});
	}

	// List the files of a folder (one API call, cached for 10 minutes).
	function listFolder(path) {
		var cache = readCache();

		if (cache[path])
			return Promise.resolve(cache[path]);

		return fetchJSON('https://api.github.com/repos/' + REPO + '/contents/' + encodeURI(path) + '?ref=' + BRANCH)
			.then(function(items) {
				if (!Array.isArray(items))
					throw new Error('Not a folder: ' + path);

				var c = readCache();
				c[path] = items;
				writeCache(c);

				return items;
			});
	}

	// Turn raw text into <p> elements, safely (no HTML injection).
	function renderText(raw) {
		var frag = document.createDocumentFragment();

		String(raw).replace(/\r\n/g, '\n').split(/\n\s*\n/).forEach(function(block) {
			block = block.replace(/^\s+|\s+$/g, '');

			if (!block)
				return;

			var p = document.createElement('p');

			block.split('\n').forEach(function(line, i) {
				if (i > 0)
					p.appendChild(document.createElement('br'));

				p.appendChild(document.createTextNode(line));
			});

			frag.appendChild(p);
		});

		return frag;
	}

	function renderMedia(target, images, videos) {
		var box = document.querySelector(target);

		if (!box)
			return;

		box.innerHTML = '';

		images.forEach(function(f) {
			var img = document.createElement('img');
			img.src = bust(f.download_url);
			img.alt = f.name.replace(/\.[^.]+$/, '');
			box.appendChild(img);
		});

		videos.forEach(function(f) {
			var v = document.createElement('video');
			v.src = bust(f.download_url);
			v.controls = true;
			v.playsInline = true;
			v.style.maxWidth = '100%';
			box.appendChild(v);
		});
	}

	function swapImage(selector, url) {
		var el = document.querySelector(selector);

		if (!el)
			return;

		// Only swap once the new image really loaded, so the old one stays visible on failure.
		var probe = new Image();

		probe.onload = function() {
			el.src = probe.src;
		};

		probe.src = url;
	}

	/*
		Content.load({
			folder:       '个人信息',
			target:       '#profile-info',              // where the text goes
			hide:         '#profile-fallback',          // hidden once text loaded
			avatar:       '#header .image.avatar img',  // first image becomes this <img>
			mediaTarget:  null                          // where images/videos go
		});
	*/
	function load(options) {
		return listFolder(options.folder).then(function(items) {
			var files = items.filter(function(it) { return it.type === 'file'; }),
				kind = function(k) { return files.filter(function(f) { return kindOf(f.name) === k; }).sort(byName); },
				texts = kind('text'),
				images = kind('image'),
				videos = kind('video');

			if (options.avatar && images.length)
				swapImage(options.avatar, bust(images[0].download_url));

			if (options.mediaTarget && (images.length || videos.length))
				renderMedia(options.mediaTarget, images, videos);

			if (!options.target || !texts.length)
				return;

			return Promise.all(texts.map(function(f) {
				return fetchText(bust(f.download_url));
			})).then(function(parts) {
				var box = document.querySelector(options.target);

				if (!box)
					return;

				box.innerHTML = '';

				parts.forEach(function(t) {
					box.appendChild(renderText(t));
				});

				if (options.hide) {
					var h = document.querySelector(options.hide);
					if (h) h.style.display = 'none';
				}
			});
		});
	}

	window.Content = {
		load: load,
		listFolder: listFolder
	};

	// Folders used by this page.
	window.addEventListener('DOMContentLoaded', function() {

		load({
			folder: '左侧信息',
			target: '#sidebar-info',
			avatar: '#header .image.avatar img'
		}).catch(function(e) {
			console.warn('[content] 左侧信息 not loaded:', e.message);
		});

		load({
			folder: '个人信息',
			target: '#profile-info',
			hide: '#profile-fallback'
		}).catch(function(e) {
			console.warn('[content] 个人信息 not loaded:', e.message);
		});

	});

})(window, document);

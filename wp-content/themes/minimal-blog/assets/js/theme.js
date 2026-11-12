/* Minimal Blog: theme toggle, ⌘K search, reading progress, TOC highlight. */
(function () {
	'use strict';

	var cfg = window.mbTheme || { i18n: {} };
	var t = cfg.i18n;
	var root = document.documentElement;

	function fmt(str, value) {
		return String(str || '').replace(/%[ds]/, value);
	}

	/* ---------- Theme toggle ---------- */

	var media = window.matchMedia('(prefers-color-scheme: dark)');

	function isDark() {
		var forced = root.getAttribute('data-theme');
		return forced ? forced === 'dark' : media.matches;
	}

	function syncToggleLabels() {
		var label = isDark() ? t.toLight : t.toDark;
		document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
			if (label) btn.setAttribute('aria-label', label);
		});
	}

	document.addEventListener('click', function (e) {
		var btn = e.target.closest('[data-theme-toggle]');
		if (!btn) return;
		var next = isDark() ? 'light' : 'dark';
		// Choosing the same mode as the system clears the override.
		var system = media.matches ? 'dark' : 'light';
		if (next === system) {
			root.removeAttribute('data-theme');
			try { localStorage.removeItem('mb-theme'); } catch (err) {}
		} else {
			root.setAttribute('data-theme', next);
			try { localStorage.setItem('mb-theme', next); } catch (err) {}
		}
		syncToggleLabels();
	});

	if (media.addEventListener) media.addEventListener('change', syncToggleLabels);
	syncToggleLabels();

	/* ---------- Search dialog ---------- */

	var dialog = document.querySelector('[data-search-dialog]');

	if (dialog && typeof dialog.showModal === 'function') {
		var input = dialog.querySelector('[data-search-input]');
		var form = dialog.querySelector('[data-search-form]');
		var list = dialog.querySelector('[data-search-results]');
		var label = dialog.querySelector('[data-search-label]');
		var tags = dialog.querySelector('[data-search-tags]');
		var empty = dialog.querySelector('[data-search-empty]');
		var emptyTitle = dialog.querySelector('[data-search-empty-title]');
		var emptyHint = dialog.querySelector('[data-search-empty-hint]');
		var initialHTML = list.innerHTML;
		var active = -1;
		var timer = null;
		var opener = null;

		// Show Ctrl K on non-Apple keyboards.
		if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
			document.querySelectorAll('[data-shortcut-label]').forEach(function (k) { k.textContent = 'Ctrl K'; });
		}

		var options = function () { return Array.prototype.slice.call(list.querySelectorAll('[role="option"]')); };

		function select(i) {
			var opts = options();
			if (!opts.length) { active = -1; input.removeAttribute('aria-activedescendant'); return; }
			active = Math.max(0, Math.min(i, opts.length - 1));
			opts.forEach(function (o, n) {
				o.id = o.id || 'search-opt-' + n;
				o.setAttribute('aria-selected', n === active ? 'true' : 'false');
			});
			input.setAttribute('aria-activedescendant', opts[active].id);
			opts[active].scrollIntoView({ block: 'nearest' });
		}

		function open(trigger) {
			opener = trigger || document.activeElement;
			dialog.showModal();
			input.focus();
			input.select();
			select(0);
		}

		function close() {
			dialog.close();
		}

		dialog.addEventListener('close', function () {
			if (opener && typeof opener.focus === 'function') opener.focus();
		});

		// Click on the backdrop closes the dialog.
		dialog.addEventListener('click', function (e) {
			if (e.target === dialog) close();
		});

		dialog.querySelector('[data-search-close]').addEventListener('click', close);

		document.addEventListener('click', function (e) {
			var trigger = e.target.closest('[data-search-open]');
			if (!trigger) return;
			e.preventDefault();
			open(trigger);
		});

		document.addEventListener('keydown', function (e) {
			if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
				e.preventDefault();
				if (dialog.open) close(); else open();
			}
		});

		function escapeHTML(s) {
			return String(s).replace(/[&<>"']/g, function (c) {
				return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
			});
		}

		function render(posts, query) {
			if (!query) {
				list.innerHTML = initialHTML;
				label.textContent = t.recent;
				if (tags) tags.hidden = false;
				empty.hidden = true;
				list.hidden = false;
				select(0);
				return;
			}

			if (tags) tags.hidden = true;

			if (!posts.length) {
				list.innerHTML = '';
				list.hidden = true;
				label.textContent = fmt(t.results, 0);
				emptyTitle.textContent = fmt(t.noResult, query);
				emptyHint.textContent = t.noHint;
				empty.hidden = false;
				active = -1;
				return;
			}

			empty.hidden = true;
			list.hidden = false;
			label.textContent = fmt(t.results, posts.length);
			list.innerHTML = posts.map(function (p) {
				var meta = p.date + (p.tags && p.tags.length ? '  ·  ' + p.tags.map(function (tg) { return '#' + tg; }).join(' ') : '');
				return '<li role="presentation"><a class="search-result" role="option" aria-selected="false" href="' + escapeHTML(p.url) + '">' +
					'<span class="search-result-text"><span class="search-result-title">' + escapeHTML(p.title) + '</span>' +
					'<span class="search-result-meta">' + escapeHTML(meta) + '</span></span>' +
					'<span class="search-result-enter" aria-hidden="true">↵</span></a></li>';
			}).join('');
			select(0);
		}

		// The index is a static file (search-index.json), loaded once on first search.
		var index = null;
		var loading = null;

		function loadIndex() {
			if (index) return Promise.resolve(index);
			if (!loading) {
				loading = fetch(cfg.searchIndex, { credentials: 'same-origin' })
					.then(function (r) { return r.ok ? r.json() : []; })
					.catch(function () { return []; })
					.then(function (rows) {
						index = (Array.isArray(rows) ? rows : []).map(function (p) {
							p._title = norm(p.title);
							p._tags = norm((p.tags || []).join(' '));
							p._text = norm(p.text);
							// Same text with every space removed, so 다크모드 finds 다크 모드 and the reverse.
							p._titleNS = noSpace(p._title);
							p._tagsNS = noSpace(p._tags);
							p._textNS = noSpace(p._text);
							return p;
						});
						return index;
					});
			}
			return loading;
		}

		// One form for comparing: composed Hangul (NFC, text pasted from macOS can be
		// decomposed NFD) and lower case.
		function norm(s) {
			s = String(s || '');
			if (s.normalize) s = s.normalize('NFC');
			return s.toLowerCase();
		}

		function noSpace(s) {
			return s.replace(/\s+/g, '');
		}

		// While an IME is still composing, the last character can be unfinished:
		// a lone jamo (테ㅁ), or a syllable whose final consonant really belongs to
		// the next syllable (테말 on the way to 테마를). Returns the queries to try,
		// in order: the text as typed, then the text without its final consonant.
		var LONE_JAMO = /[ᄀ-ᇿㄱ-ㆎ]$/;

		function candidates(query, composing) {
			if (LONE_JAMO.test(query)) {
				var cut = query.slice(0, -1).trim();
				return cut ? [cut] : [];
			}
			var last = query.charCodeAt(query.length - 1);
			if (composing && last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0) {
				var open = String.fromCharCode(last - ((last - 0xac00) % 28));
				return [query, query.slice(0, -1) + open];
			}
			return [query];
		}

		function has(p, field, w) {
			return p['_' + field].indexOf(w) !== -1 || p['_' + field + 'NS'].indexOf(w) !== -1;
		}

		// Every word must appear somewhere; title hits rank above tag hits, tag hits above body hits.
		function match(rows, query) {
			var words = norm(query).split(/\s+/).map(function (w) { return w.replace(/^#/, ''); }).filter(Boolean);
			var whole = noSpace(words.join(''));
			var scored = [];
			rows.forEach(function (p, order) {
				// Only posts in the language of the page being read.
				if (cfg.lang && p.lang && p.lang !== cfg.lang) return;
				var score = 0;
				for (var i = 0; i < words.length; i++) {
					var w = words[i];
					if (has(p, 'title', w)) score += 3;
					else if (has(p, 'tags', w)) score += 2;
					else if (has(p, 'text', w)) score += 1;
					else return;
				}
				// The query as one phrase (spaces ignored) ranks a post higher.
				if (words.length > 1 && (p._titleNS.indexOf(whole) !== -1 || p._textNS.indexOf(whole) !== -1)) score += 2;
				scored.push({ p: p, score: score, order: order });
			});
			scored.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
			return scored.slice(0, 8).map(function (s) { return s.p; });
		}

		var lastQuery = '';

		function search(raw, composing) {
			// Compose first: a decomposed (NFD) query ends in a jamo and would look unfinished.
			if (raw.normalize) raw = raw.normalize('NFC');
			lastQuery = raw;
			if (!raw) { render([], ''); return; }
			var tries = candidates(raw, composing);
			// Only a first jamo typed so far (ㄱ): keep showing the recent posts.
			if (!tries.length) { render([], ''); return; }
			loadIndex().then(function (rows) {
				if (raw !== lastQuery) return;
				var found = [];
				for (var i = 0; i < tries.length && !found.length; i++) found = match(rows, tries[i]);
				render(found, raw);
			});
		}

		function onType(composing) {
			clearTimeout(timer);
			var q = input.value.trim();
			timer = setTimeout(function () { search(q, composing); }, 80);
		}

		input.addEventListener('input', function (e) { onType(!!e.isComposing); });
		// Chrome fires the last input event while still composing; search again once the syllable is final.
		input.addEventListener('compositionend', function () { onType(false); });

		// Warm the index while the user is about to type.
		input.addEventListener('focus', loadIndex, { once: true });

		input.addEventListener('keydown', function (e) {
			// A search input eats the first Escape to clear its text; close the dialog instead.
			if (e.key === 'Escape') { e.preventDefault(); close(); }
			else if (e.key === 'ArrowDown') { e.preventDefault(); select(active + 1); }
			else if (e.key === 'ArrowUp') { e.preventDefault(); select(active - 1); }
			else if (e.key === 'Enter' && active >= 0) {
				var opts = options();
				if (opts[active]) { e.preventDefault(); window.location.href = opts[active].href; }
			}
		});

		list.addEventListener('mousemove', function (e) {
			var opt = e.target.closest('[role="option"]');
			if (!opt) return;
			var i = options().indexOf(opt);
			if (i !== active) select(i);
		});

		// The static site has no search page, so the form never submits.
		form.addEventListener('submit', function (e) { e.preventDefault(); });

		document.querySelectorAll('[data-search-open]').forEach(function (b) { b.hidden = false; });
	}

	/* ---------- Reading progress ---------- */

	var progress = document.querySelector('[data-progress]');
	var prose = document.querySelector('[data-prose]');

	if (progress && prose) {
		var bar = progress.firstElementChild;
		var ticking = false;

		var update = function () {
			ticking = false;
			var rect = prose.getBoundingClientRect();
			var total = rect.height - window.innerHeight * 0.6;
			var done = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1;
			bar.style.transform = 'scaleX(' + done + ')';
			progress.setAttribute('aria-valuenow', String(Math.round(done * 100)));
		};

		window.addEventListener('scroll', function () {
			if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
		}, { passive: true });
		window.addEventListener('resize', update);
		update();
	}

	/* ---------- TOC highlight ---------- */

	var toc = document.querySelector('[data-toc]');

	if (toc && 'IntersectionObserver' in window) {
		var links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
		var byId = {};
		var headings = links.map(function (a) {
			var id = decodeURIComponent(a.getAttribute('href').slice(1));
			byId[id] = a;
			return document.getElementById(id);
		}).filter(Boolean);

		var setCurrent = function (id) {
			links.forEach(function (a) { a.removeAttribute('aria-current'); });
			if (byId[id]) byId[id].setAttribute('aria-current', 'true');
		};

		var observer = new IntersectionObserver(function () {
			// The current section is the last heading above the reading line.
			var current = headings[0] ? headings[0].id : null;
			headings.forEach(function (h) {
				if (h.getBoundingClientRect().top < window.innerHeight * 0.3) current = h.id;
			});
			if (current) setCurrent(current);
		}, { rootMargin: '0px 0px -70% 0px' });

		headings.forEach(function (h) { observer.observe(h); });
		if (headings[0]) setCurrent(headings[0].id);
	}

	/* ---------- Language menu: close on outside click and Escape ---------- */

	var langSwitch = document.querySelector('[data-lang-switch]');

	if (langSwitch) {
		document.addEventListener('click', function (e) {
			if (langSwitch.open && !langSwitch.contains(e.target)) langSwitch.open = false;
		});
		langSwitch.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && langSwitch.open) {
				langSwitch.open = false;
				langSwitch.querySelector('summary').focus();
			}
		});
	}

	/* ---------- Close the inline TOC after a pick ---------- */

	document.addEventListener('click', function (e) {
		var link = e.target.closest('.toc-inline a');
		if (link) link.closest('details').open = false;
	});
})();

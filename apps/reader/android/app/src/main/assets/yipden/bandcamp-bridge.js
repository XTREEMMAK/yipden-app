/*
 * YipDen's Bandcamp bridge. Android adds this to frames from bandcamp.com in the app's own
 * WebView only (MainActivity, `addDocumentStartJavaScript`), never to the in-app browser and
 * never to any other site. `YIPDEN_APP` (the app's own origin) is written in front of it there.
 *
 * Bandcamp's embedded player has no API: it cannot be told to play, and never says when a track
 * ends. Inside its frame it is one `<audio>` element and a play button, so this reads the one
 * and presses the other:
 *
 * - It reports to the app, and only to the app's origin: ready, playing or paused, the time,
 *   the duration, and the end. An album moves on to its next track on the same element, so an
 *   end only counts when nothing has started again a moment later.
 * - It takes play, pause and seek, and only from the app's origin. Nothing else is accepted, and
 *   it changes nothing on the page but what Bandcamp's own button and player would.
 *
 * It only runs inside a frame: Bandcamp opened as a page of its own is left alone.
 */
(function () {
	if (window.top === window) return;
	var app = YIPDEN_APP;
	var audio = null;
	var lastTime = -1;

	function send(type, value) {
		try {
			window.parent.postMessage({ yipdenBandcamp: 1, type: type, value: value }, app);
		} catch (e) {
			// The app is gone: nothing to tell.
		}
	}

	function attach(el) {
		if (!el || el === audio) return;
		audio = el;
		el.addEventListener('playing', function () {
			send('playing', true);
		});
		el.addEventListener('pause', function () {
			send('playing', false);
		});
		el.addEventListener('durationchange', function () {
			if (isFinite(el.duration)) send('duration', el.duration);
		});
		el.addEventListener('timeupdate', function () {
			// Whole seconds are enough for the app's clock and the car's.
			var whole = Math.floor(el.currentTime);
			if (whole === lastTime) return;
			lastTime = whole;
			send('time', el.currentTime);
		});
		el.addEventListener('ended', function () {
			// An album's next track starts on this same element: only a real end is an end.
			setTimeout(function () {
				if (el.paused) send('ended');
			}, 1500);
		});
	}

	function find() {
		attach(document.querySelector('audio'));
	}

	/** Bandcamp's own play button, so its player and its page stay in step. */
	function pressPlay() {
		var button =
			document.getElementById('big_play_button') || document.querySelector('.playbutton');
		if (button) button.click();
		else if (audio) audio.play();
	}

	window.addEventListener('message', function (event) {
		if (event.origin !== app) return;
		var data = event.data;
		if (!data || data.yipdenBandcamp !== 1) return;
		find();
		if (data.command === 'play') {
			if (!audio || audio.paused) pressPlay();
		} else if (data.command === 'pause') {
			if (audio && !audio.paused) audio.pause();
		} else if (data.command === 'seek') {
			if (audio && typeof data.value === 'number' && isFinite(data.value)) {
				audio.currentTime = data.value;
			}
		}
	});

	new MutationObserver(find).observe(document, { childList: true, subtree: true });
	document.addEventListener('DOMContentLoaded', function () {
		find();
		send('ready');
	});
})();

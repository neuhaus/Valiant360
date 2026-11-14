## Valiant 360 (beta)

### A browser-based player for 360 degree panorama photos and videos.

[Example](http://flimshaw.github.io/Valiant360) - [Development Log](https://github.com/flimshaw/Valiant360/wiki/Development-log)


#### About

The aim of this project is to provide a free, minimalist WebGL viewer for 360 degree media in modern browsers, covering both **equirectangular photos** and **360 degree video**. It is implemented as a jQuery plugin, with a limited interface for controlling video playback (photo viewers simply ignore the playback controls), and mouse/scrollwheel controls for zooming and panning.

Both kinds of source are a single 2:1 equirectangular map projected onto a sphere. Cube maps, tiled/multiresolution panoramas and partial panoramas are not supported.

There is currently no mobile support, but as Chrome and Safari mobile editions enable WebGL, this should be forwards-compatible with them.

#### WebXR / VR headsets

Valiant360 can play panoramas and 360 videos in VR on WebXR headsets such as the **Meta Quest 3** (and any other `immersive-vr` device, including desktop headsets via a WebXR-capable browser). When a headset is available a small **VR** button appears in the player controls; pressing it starts an immersive session, and the panorama is re-oriented around the viewer so head tracking pans the view. Pressing the button again (or removing the headset) returns to the regular flat view.

Requirements:

* A WebXR-capable browser over **HTTPS** (`localhost` is also treated as secure).
* WebGL. The plugin now requires [three.js r160+](https://threejs.org/), which ships WebXR support. The bundled library in `demo/js/three.min.js` is already at r160 (the last release with a browser-global build; newer releases are ES-module only).

Disable the feature with the `enableXR` option, or drive it from code with `enterVR()` / `exitVR()` (see below).

**Tuning image quality in VR.** The panorama is rendered with anti-aliasing on and (by default) no fixed foveation, i.e. full resolution even in the periphery. Two options trade GPU for sharpness:

| Option | Default | Effect |
| --- | --- | --- |
| `xrFramebufferScale` | `1` | Supersamples the XR framebuffer: `1.2` renders 1.2x per axis (~1.44x the pixels) for a sharper image. The bundled demo uses `1.2`. If a headset starts dropping frames, lower it (e.g. `1.15`) or go back to `1`. |
| `xrFoveation` | `0` | `0` keeps full peripheral resolution; raising it towards `1` reduces peripheral detail to save GPU. |

```js
$('.valiantContainer').Valiant360({
	xrFramebufferScale: 1.2,	// sharper on a Meta Quest 3, more GPU
	xrFoveation: 0			// 0 = full peripheral quality
});
```

#### Usage 

See the [demo folder](https://github.com/flimshaw/Valiant360/tree/master/demo) or the [example](http://flimshaw.github.io/Valiant360).  Moving the mouse will pan the camera, and the scroll wheel will zoom in and out.

**Markup**

On the HTML side, create a div to act as your container, and point it at the media with `data-video-src` (360 degree video) or `data-photo-src` (equirectangular photo):

```
	<!-- 360 degree video -->
	<div class="valiantContainer" data-video-src="videos/my-video.mp4"></div>

	<!-- equirectangular photo (2:1, any resolution) -->
	<div class="valiantContainer" data-photo-src="images/my-photo.jpg"></div>
```

**Javascript**

More detailed api documentation pending, for now the below explains about all you can do.

```
	// initialize plugin, default options shown
	$('.valiantContainer').Valiant360({
		crossOrigin: 'anonymous',	// valid keywords: 'anonymous' or 'use-credentials'
		clickAndDrag: false,	// use click-and-drag camera controls
		keyboardControls: true, // use keyboard controls (move by arrows)
		flatProjection: false,	// map image to appear flat (often more distorted)
		fov: 35, 				// initial field of view
		fovMin: 3, 				// min field of view allowed
		fovMax: 100, 			// max field of view allowed
		hideControls: false,	// hide player controls
		lon: 0, 				// initial lon for camera angle
		lat: 0, 				// initial lat for camera angle
		loop: "loop", 			// video loops by default
		muted: true,			// video muted by default
		volume: 0.5,			// video volume by default
		autoplay: true,			// video autoplays by default
		enableXR: true,			// show a VR button when a WebXR headset is available
		xrReferenceSpace: 'local',	// WebXR reference space used while in VR
		xrFramebufferScale: 1,		// XR framebuffer scale; >1 supersamples (sharper, more GPU)
		xrFoveation: 0			// 0 = full peripheral quality, 1 = maximum foveation
	});

	// play video
	$('.valiantContainer').Valiant360('play');

	// pause video
	$('.valiantContainer').Valiant360('pause');

	// load new video file
	$('.valiantContainer').Valiant360('loadVideo', 'path/to/file.mp4');

	// load new photo file
	$('.valiantContainer').Valiant360('loadPhoto', 'path/to/file.jpg');

	// enter VR (requires a WebXR headset and a secure context)
	$('.valiantContainer').Valiant360('enterVR');

	// leave VR
	$('.valiantContainer').Valiant360('exitVR');

	// destroy Valiant360 processing/resources (however, will not remove element from the dom. That is left up to you)
	$('.valiantContainer').Valiant360('destroy');	

```

#### A note on the crossOrigin CORS option
Allows images and videos to be served from a domain separate to where Valiant360 is hosted (eg a CDN). **If a crossOrigin keyword is not specified, anonymous is used**.

This option will allow Valiant360 to grab cross-domain assets for Chrome and Firefox, however at time of writing Safari throws the error: `[Error] SecurityError: DOM Exception 18: An attempt was made to break through the security policy of the user agent.`

Cross-domain tested on Mac OSX Yosemite: Chrome v43.0.2357.130, Chrome Canary v45.0.2449.0, Firefox v39.0, Safari v8.0.6.

For further explanation on these CORS keywords, see:
* [MDN CORS settings attributes](https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_settings_attributes)
* [WHATWG CORS settings attributes](https://html.spec.whatwg.org/multipage/infrastructure.html#cors-settings-attribute)

#### 3rd party libraries and their licenses

The following assets are used in this tool's creation.

+ [JQuery 1.7.2+](http://jquery.com) (MIT License)
+ [Three.js](http://threejs.org/) + Detector (MIT License)
+ [Font Awesome](http://fortawesome.github.io/Font-Awesome/) (MIT License)
/*!
 * Valiant360 panorama video player/photo viewer jquery plugin
 *
 * Copyright (c) 2014 Charlie Hoey <@flimshaw>
 *
 * Released under the MIT license:
 *   http://www.opensource.org/licenses/mit-license.php
 *
 * Jquery plugin pattern based on https://github.com/jquery-boilerplate/jquery-patterns/blob/master/patterns/jquery.basic.plugin-boilerplate.js
 */

/* REQUIREMENTS:

jQuery 1.7.2 or greater
three.js r128 or higher (for WebXR / VR headset support)

*/


/*!
 * jQuery lightweight plugin boilerplate
 * Original author: @ajpiano
 * Further changes, comments: @addyosmani
 * Licensed under the MIT license
 */

// the semi-colon before the function invocation is a safety
// net against concatenated scripts and/or other plugins
// that are not closed properly.
;(function ( $, THREE, Detector, window, document, undefined ) {

    // undefined is used here as the undefined global
    // variable in ECMAScript 3 and is mutable (i.e. it can
    // be changed by someone else). undefined isn't really
    // being passed in so we can ensure that its value is
    // truly undefined. In ES5, undefined can no longer be
    // modified.

    // window and document are passed through as local
    // variables rather than as globals, because this (slightly)
    // quickens the resolution process and can be more
    // efficiently minified (especially when both are
    // regularly referenced in your plugin).

    // Create the defaults once
    var pluginName = "Valiant360",
        plugin, // will hold reference to instantiated Plugin
        defaults = {
            crossOrigin: 'anonymous',
            clickAndDrag: false,
			keyboardControls: true,
            fov: 35,
            fovMin: 3,
            fovMax: 100,
            hideControls: false,
            lon: 0,
            lat: 0,
            loop: "loop",
            muted: true,
			volume: 0.5,
            debug: false,
            flatProjection: false,
            autoplay: true,
            enableXR: true,					// offer a VR button when a headset/WebXR is available
            xrReferenceSpace: 'local'		// WebXR reference space used while in VR
        };

    // The actual plugin constructor
    function Plugin( element, options ) {
        this.element = element;

        // jQuery has an extend method that merges the
        // contents of two or more objects, storing the
        // result in the first object. The first object
        // is generally empty because we don't want to alter
        // the default options for future instances of the plugin
        this.options = $.extend( {}, defaults, options) ;

        this._defaults = defaults;
        this._name = pluginName;

        this.init();
    }

    Plugin.prototype = {

        init: function() {
            // Place initialization logic here
            // You already have access to the DOM element and
            // the options via the instance, e.g. this.element
            // and this.options
            // you can add more functions like the one below and
            // call them like so: this.yourOtherFunction(this.element, this.options).

            // instantiate some local variables we're going to need
            this._time = new Date().getTime();
            this._controls = {};
            this._id = this.generateUUID();

            this._requestAnimationId = ''; // used to cancel requestAnimationFrame on destroy
            this._usingAnimationLoop = false; // true when three.js drives the render loop
            this._isVideo = false;
            this._isPhoto = false;
            this._isFullscreen = false;
            this._isXRPresenting = false; // true while an immersive VR/AR session is running
            this._xrSupported = false;
            this._mouseDown = false;
            this._dragStart = {};

            // reusable objects for orienting the panorama while in VR
            this._xrAxisX = new THREE.Vector3( 1, 0, 0 );
            this._xrAxisY = new THREE.Vector3( 0, 1, 0 );
            this._xrQuatX = new THREE.Quaternion();
            this._xrQuatY = new THREE.Quaternion();

            this._lat = this.options.lat;
            this._lon = this.options.lon;
            this._fov = this.options.fov;

            // save our original height and width for returning from fullscreen
            // capture the container size; the renderer canvas is not created yet,
            // so reading a canvas here always yielded null and broke fullscreen exit
            this._originalWidth = $(this.element).width();
            this._originalHeight = $(this.element).height();

            // add a class to our element so it inherits the appropriate styles
            $(this.element).addClass('Valiant360_default');
			
			// add tabindex attribute to enable the focus on the element (required for keyboard controls)  
			if(this.options.keyboardControls && !$(this.element).attr("tabindex")){
				$(this.element).attr("tabindex", "1");
			}

            if(this.createMediaPlayer() === false) {
                return;
            }
            this.createControls();
            this.setupXR();

        },

        generateUUID: function(){
            var d = new Date().getTime();
            var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = (d + Math.random()*16)%16 | 0;
                d = Math.floor(d/16);
                return (c==='x' ? r : (r&0x7|0x8)).toString(16);
            });
            return uuid;
        },

        loadTexture: function(url) {
            // modern replacement for the removed THREE.ImageUtils.loadTexture
            var loader = new THREE.TextureLoader();
            loader.setCrossOrigin(this.options.crossOrigin);
            return loader.load(url);
        },

        // translate a focal length (mm, 35mm full-frame) into the camera FOV.
        // Replaces three.js' now-deprecated PerspectiveCamera.setLens so the
        // zoom behaviour is identical on both old and new three.js builds.
        setLens: function(focalLength, frameHeight) {
            if ( frameHeight === undefined ) { frameHeight = 24; }
            this._camera.fov = 2 * Math.atan( frameHeight / ( focalLength * 2 ) ) * 180 / Math.PI;
            this._camera.updateProjectionMatrix();
        },

        createMediaPlayer: function() {
			
			// make a self reference we can pass to our callbacks
            var self = this;

            // create a local THREE.js scene
            this._scene = new THREE.Scene();

            // create ThreeJS camera
            this._camera = new THREE.PerspectiveCamera(this._fov, $(this.element).width() / $(this.element).height(), 0.1, 1000);
            this.setLens(this._fov);

            // create ThreeJS renderer and append it to our object
            // (modern three.js only ships a WebGL renderer; CanvasRenderer was removed)
            if(!Detector.webgl) {
                console.error('Valiant360: WebGL is not supported by this browser');
                this.showError();
                return false;
            }
            this._renderer = new THREE.WebGLRenderer();
            this._renderer.setSize( $(this.element).width(), $(this.element).height() );
            this._renderer.autoClear = false;
            this._renderer.setClearColor( 0x333333, 1 );

            // append the rendering element to this div
            $(this.element).append(this._renderer.domElement);
			
			var createAnimation = function () {
                self._texture.generateMipmaps = false;
				self._texture.minFilter = THREE.LinearFilter;
				self._texture.magFilter = THREE.LinearFilter;
				// keep photos on the leaner RGB format, but leave video textures at the
				// default RGBA since some mobile/headset GPU drivers reject RGB uploads
				if(self._isPhoto && typeof THREE.RGBFormat !== 'undefined') {
					self._texture.format = THREE.RGBFormat;
				}

				// create ThreeJS mesh sphere onto which our texture will be drawn
				self._mesh = new THREE.Mesh( new THREE.SphereGeometry( 500, 80, 50 ), new THREE.MeshBasicMaterial( { map: self._texture } ) );
				self._mesh.scale.x = -1; // mirror the texture, since we're looking from the inside out

				// keep the mesh in a group so it can be re-oriented for WebXR without
				// disturbing the camera-on-the-sphere trick used by the regular view
				self._meshGroup = new THREE.Group();
				self._meshGroup.add(self._mesh);
				self._scene.add(self._meshGroup);

				self.startAnimation();
            };

            // figure out our texturing situation, based on what our source is
            if( $(this.element).attr('data-photo-src') ) {
                this._isPhoto = true;
                this._texture = this.loadTexture( $(this.element).attr('data-photo-src') );
				createAnimation();
            } else {
                this._isVideo = true;
				
				// create loading overlay
				var loadingHTML =  '<div class="loading"> \
										<div class="icon waiting-icon"></div> \
										<div class="icon error-icon"><i class="fa fa-exclamation-triangle" aria-hidden="true"></i></div> \
									</div>';
                $(this.element).append(loadingHTML);				
				this.showWaiting();
				
                // create off-dom video player
                this._video = document.createElement( 'video' );
                this._video.setAttribute('crossorigin', this.options.crossOrigin);
                this._video.style.display = 'none';
                $(this.element).append( this._video );
                this._video.loop = this.options.loop;
                this._video.muted = this.options.muted;
				this._video.volume = this.options.volume;

                // attach video player event listeners
                this._video.addEventListener("ended", function() {

                });

                // Progress Meter
                this._video.addEventListener("progress", function() {
                    var percent = null;
                    if (self._video && self._video.buffered && self._video.buffered.length > 0 && self._video.buffered.end && self._video.duration) {
                        percent = self._video.buffered.end(0) / self._video.duration;
                    }
                    // Some browsers (e.g., FF3.6 and Safari 5) cannot calculate target.bufferered.end()
                    // to be anything other than 0. If the byte count is available we use this instead.
                    // Browsers that support the else if do not seem to have the bufferedBytes value and
                    // should skip to there. Tested in Safari 5, Webkit head, FF3.6, Chrome 6, IE 7/8.
                    else if (self._video && self._video.bytesTotal !== undefined && self._video.bytesTotal > 0 && self._video.bufferedBytes !== undefined) {
                        percent = self._video.bufferedBytes / self._video.bytesTotal;
                    }

                    // Someday we can have a loading animation for videos
                    var cpct = Math.round(percent * 100);
                    if(cpct === 100) {
                        // do something now that we are done
                    } else {
                        // do something with this percentage info (cpct)
                    }
                });
				// Error listener
				this._video.addEventListener('error', function (event) {
                    console.error(self._video.error);
                    self.showError();
                });
				
				this._video.addEventListener("timeupdate", function() {
                    if (this.paused === false){
                        var percent = this.currentTime * 100 / this.duration;
                        $(self.element).find('.controlsWrapper > .valiant-progress-bar')[0].children[0].setAttribute("style", "width:" + percent + "%;");
                        $(self.element).find('.controlsWrapper > .valiant-progress-bar')[0].children[1].setAttribute("style", "width:" + (100 - percent) + "%;");
						//Update time label
						var durMin = Math.floor(this.duration / 60);
						var durSec = Math.floor(this.duration - (durMin * 60));
						var timeMin = Math.floor(this.currentTime / 60);
						var timeSec = Math.floor(this.currentTime - (timeMin * 60));
						var duration = durMin + ':' + (durSec < 10 ? '0' + durSec : durSec);
						var currentTime = timeMin + ':' + (timeSec < 10 ? '0' + timeSec : timeSec);
						$(self.element).find('.controls .timeLabel').html(currentTime+' / '+duration);
                    }
                });
				
				// IE 11 and previous not supports THREE.Texture([video]), we must create a canvas that draws the video and use that to create the Texture
				var isIE = navigator.appName == 'Microsoft Internet Explorer' || !!(navigator.userAgent.match(/Trident/) || navigator.userAgent.match(/rv 11/));
				if (isIE) {
                    this._videocanvas = document.createElement('canvas');
					this._texture = new THREE.Texture(this._videocanvas);
                    // set canvas size = video size when known
                    this._video.addEventListener('loadedmetadata', function () {
                        self._videocanvas.width = self._video.videoWidth;
                        self._videocanvas.height = self._video.videoHeight;
						createAnimation();
                    });
                }else{
					this._texture = new THREE.Texture( this._video );
				}

                //force browser caching of the video to solve rendering errors with big videos
                var xhr = new XMLHttpRequest();
                xhr.open('GET', $(this.element).attr('data-video-src'), true);
                xhr.responseType = 'blob';
                xhr.onload = function (e) {
                    if (this.status === 200) {
                        var vid = (window.webkitURL ? webkitURL : URL).createObjectURL(this.response);
                        //Video Play Listener, fires after video loads
                        $(self._video).bind("canplaythrough", function () {
                            // the video is ready to show either way; only the autoplay
                            // is conditional, otherwise the loading overlay covered the
                            // player forever when autoplay was disabled
                            self.hideWaiting();
                            if (self.options.autoplay === true) {
                                self.play();
                                self._videoReady = true;
                            }
                        });

						// set the video src and begin loading
                        self._video.src = vid;
                    }
                };
                xhr.onreadystatechange = function (oEvent) {
                    if (xhr.readyState === 4) {
                        if (xhr.status !== 200) {
                            console.error('Video error: status ' + xhr.status);
                            self.showError();
                        }
                    }
                };
                xhr.send();

				if(!isIE){
					createAnimation();
				}
            }
        },

        // creates div and buttons for onscreen video controls
        createControls: function() {

            var muteControl = this.options.muted ? 'fa-volume-off' : 'fa-volume-up';
            var playPauseControl = this.options.autoplay ? 'fa-pause' : 'fa-play';

            var controlsHTML = ' \
              <div class="controlsWrapper">\
                <div class="valiant-progress-bar">\
                    <div style="width: 0;"></div><div style="width: 100%;"></div>\
                </div>\
                <div class="controls"> \
                    <a href="#" class="playButton button fa '+ playPauseControl +'"></a> \
					<div class="audioControl">\
						<a href="#" class="muteButton button fa '+ muteControl +'"></a> \
						<div class="volumeControl">\
							<div class="volumeBar">\
								<div class="volumeProgress"></div>\
								<div class="volumeCursor"></div>\
							</div>\
						</div>\
					</div>\
					<span class="timeLabel"></span> \
                    <a href="#" class="fullscreenButton button fa fa-expand"></a> \
                    <a href="#" class="vrButton button" title="View in VR">VR</a> \
                </div> \
              </div>\
            ';

            $(this.element).append(controlsHTML, true);
			$(this.element).append('<div class="timeTooltip">00:00</div>', true);

            // hide controls if option is set
            if(this.options.hideControls) {
                $(this.element).find('.controls').hide();
            }

            // wire up controller events to dom elements
            this.attachControlEvents();
        },

        attachControlEvents: function() {

            // create a self var to pass to our controller functions
            var self = this;

            // record every listener we register so destroy() can remove it again
            var listeners = this._listeners = [];
            var addListener = function(target, type, handler, options) {
                target.addEventListener(type, handler, options);
                listeners.push([target, type, handler, options]);
            };

            addListener( this.element, 'mousemove', this.onMouseMove.bind(this), false );
            addListener( this.element, 'touchmove', this.onMouseMove.bind(this), false );
            addListener( this.element, 'mousewheel', this.onMouseWheel.bind(this), false );
            addListener( this.element, 'DOMMouseScroll', this.onMouseWheel.bind(this), false );
            addListener( this.element, 'mousedown', this.onMouseDown.bind(this), false);
            addListener( this.element, 'touchstart', this.onMouseDown.bind(this), false);
            addListener( this.element, 'mouseup', this.onMouseUp.bind(this), false);
            addListener( this.element, 'touchend', this.onMouseUp.bind(this), false);
			
			if(this.options.keyboardControls){
				addListener(this.element, 'keydown',this.onKeyDown.bind(this), false);
                addListener(this.element, 'keyup',this.onKeyUp.bind(this), false);
				// Used custom press event because for the arrow buttons is not throws the 'keypress' event
                addListener(this.element, 'keyArrowPress',this.onKeyArrowPress.bind(this), false);
				addListener(this.element, 'click',function () {
                                $(self.element).focus();
                            },false);
			}

            var progressBar = $(self.element).find('.controlsWrapper > .valiant-progress-bar')[0];
            addListener( progressBar, "click", this.onProgressClick.bind(this), false);
			addListener( progressBar, "mousemove", this.onProgressMouseMove.bind(this), false);
			addListener( progressBar, "mouseout", this.onProgressMouseOut.bind(this), false);

            this._fullscreenHandler = this.fullscreen.bind(this);
            $(document).on('webkitfullscreenchange mozfullscreenchange fullscreenchange MSFullscreenChange', this._fullscreenHandler);

            this._resizeHandler = function() {
                self.resizeGL($(self.element).width(), $(self.element).height());
            };
            $(window).resize(this._resizeHandler);

            // Player Controls
            $(this.element).find('.playButton').click(function(e) {
                e.preventDefault();
                if(!self._isVideo) { return; } // no media to play for photo viewers
                if($(this).hasClass('fa-pause')) {
                    $(this).removeClass('fa-pause').addClass('fa-play');
                    self.pause();
                } else {
                    $(this).removeClass('fa-play').addClass('fa-pause');
                    self.play();
                }
            });

            $(this.element).find(".fullscreenButton").click(function(e) {
                e.preventDefault();
                var elem = $(self.element)[0];
                if($(this).hasClass('fa-expand')) {
                    if (elem.requestFullscreen) {
                        elem.requestFullscreen();
                    } else if (elem.msRequestFullscreen) {
                        elem.msRequestFullscreen();
                    } else if (elem.mozRequestFullScreen) {
                        elem.mozRequestFullScreen();
                    } else if (elem.webkitRequestFullscreen) {
                        elem.webkitRequestFullscreen();
                    }
                } else {
                    if (elem.requestFullscreen) {
                        document.exitFullscreen();
                    } else if (elem.msRequestFullscreen) {
                        document.msExitFullscreen();
                    } else if (elem.mozRequestFullScreen) {
                        document.mozCancelFullScreen();
                    } else if (elem.webkitRequestFullscreen) {
                        document.webkitExitFullscreen();
                    }
                }
            });

            $(this.element).find(".vrButton").click(function(e) {
                e.preventDefault();
                if(self._isXRPresenting) {
                    self.exitVR();
                } else {
                    self.enterVR();
                }
            });

            $(this.element).find(".muteButton").click(function(e) {
                e.preventDefault();
                if(!self._isVideo) { return; } // photo viewers have no audio
                if($(this).hasClass('fa-volume-off')) {
                    $(this).removeClass('fa-volume-off').addClass('fa-volume-up');
                    self._video.muted = false;
                } else {
                    $(this).removeClass('fa-volume-up').addClass('fa-volume-off');
                    self._video.muted = true;
                }
            });

			$(this.element).find('.controlsWrapper .volumeControl')
				.mousedown(this.onVolumeMouseDown.bind(this))
				.mouseup(this.onVolumeMouseUp.bind(this))
				.mouseleave(this.onVolumeMouseUp.bind(this))
				.mousemove(this.onVolumeMouseMove.bind(this));
			
			$(this._video).on('volumechange',this.onVolumeChange.bind(this));
        },

        // detect WebXR availability and wire up the VR button / session events
        setupXR: function() {
            var self = this;

            if(!this.options.enableXR || !this._renderer.xr) {
                return;
            }

            this._renderer.xr.enabled = true;
            if(this.options.xrReferenceSpace) {
                this._renderer.xr.setReferenceSpaceType(this.options.xrReferenceSpace);
            }

            this._renderer.xr.addEventListener('sessionstart', function() {
                self._isXRPresenting = true;
                self._renderer.autoClear = true; // let the renderer clear each eye
                $(self.element).addClass('xr-presenting');
                $(self.element).find('.vrButton').addClass('active').html('Exit VR');
            });

            this._renderer.xr.addEventListener('sessionend', function() {
                self._isXRPresenting = false;
                self._renderer.autoClear = false;
                // VR re-orients the mesh; undo it so the flat view looks correct again
                if(self._meshGroup) {
                    self._meshGroup.quaternion.identity();
                }
                $(self.element).removeClass('xr-presenting');
                $(self.element).find('.vrButton').removeClass('active').html('VR');
            });

            // only reveal the button when the device actually supports an immersive session
            if(navigator.xr) {
                var check = navigator.xr.isSessionSupported
                    ? navigator.xr.isSessionSupported('immersive-vr')
                    : (navigator.xr.supportsSession ? navigator.xr.supportsSession('immersive-vr') : Promise.resolve(false));
                check.then(function(supported) {
                    if(supported) {
                        self._xrSupported = true;
                        $(self.element).find('.vrButton').show();
                    }
                }).catch(function() {});
            }
        },

        enterVR: function() {
            var self = this;

            if(!navigator.xr || !this._renderer.xr || !this._renderer.xr.enabled) {
                console.warn('Valiant360: WebXR is not available in this browser');
                return;
            }

            navigator.xr.requestSession('immersive-vr', {
                optionalFeatures: ['local-floor', 'bounded-floor']
            }).then(function(session) {
                return self._renderer.xr.setSession(session);
            }).catch(function(err) {
                console.error('Valiant360: unable to start VR session', err);
            });
        },

        exitVR: function() {
            if(this._renderer.xr && this._renderer.xr.getSession) {
                var session = this._renderer.xr.getSession();
                if(session) {
                    session.end();
                }
            }
        },

        // Orient the panorama so the point at (lon, lat) sits in front of the viewer
        // while the headset drives the camera. Built as Rx(phi - PI/2) * Ry(theta + PI/2)
        // so the panorama never rolls relative to the horizon.
        updateXRView: function() {
            var phi = ( 90 - this._lat ) * Math.PI / 180;
            var theta = this._lon * Math.PI / 180;

            this._xrQuatX.setFromAxisAngle( this._xrAxisX, phi - Math.PI / 2 );
            this._xrQuatY.setFromAxisAngle( this._xrAxisY, theta + Math.PI / 2 );
            this._meshGroup.quaternion.copy( this._xrQuatX ).multiply( this._xrQuatY );
        },

        // touch events carry their coordinates on touches[0]; reading pageX/clientX
        // straight off the event yielded undefined and produced NaN camera angles
        getPointer: function(event) {
            return (event.touches && event.touches.length) ? event.touches[0] : event;
        },

        onMouseMove: function(event) {
            var pointer = this.getPointer(event);
            if(event.touches) { event.preventDefault(); }

            this._onPointerDownPointerX = pointer.clientX;
            this._onPointerDownPointerY = -pointer.clientY;

            this.relativeX = pointer.pageX - $(this.element).find('canvas').offset().left;

            this._onPointerDownLon = this._lon;
            this._onPointerDownLat = this._lat;

            var x, y;

            if(this.options.clickAndDrag) {
                if(this._mouseDown) {
                    x = pointer.pageX - this._dragStart.x;
                    y = pointer.pageY - this._dragStart.y;
                    this._dragStart.x = pointer.pageX;
                    this._dragStart.y = pointer.pageY;
                    this._lon += x;
                    this._lat -= y;
                }
            } else {
                x = pointer.pageX - $(this.element).find('canvas').offset().left;
                y = pointer.pageY - $(this.element).find('canvas').offset().top;
                this._lon = ( x / $(this.element).find('canvas').width() ) * 430 - 225;
                this._lat = ( y / $(this.element).find('canvas').height() ) * -180 + 90;
            }
        },

        onMouseWheel: function(event) {

            var wheelSpeed = -0.01;

            // WebKit
            if ( event.wheelDeltaY ) {
                this._fov -= event.wheelDeltaY * wheelSpeed;
            // Opera / Explorer 9
            } else if ( event.wheelDelta ) {
                this._fov -= event.wheelDelta * wheelSpeed;
            // Firefox
            } else if ( event.detail ) {
                this._fov += event.detail * 1.0;
            }

            if(this._fov < this.options.fovMin) {
                this._fov = this.options.fovMin;
            } else if(this._fov > this.options.fovMax) {
                this._fov = this.options.fovMax;
            }

            this.setLens(this._fov);
            event.preventDefault();
        },

        onMouseDown: function(event) {
            var pointer = this.getPointer(event);
            this._mouseDown = true;
            this._dragStart.x = pointer.pageX;
            this._dragStart.y = pointer.pageY;
        },

        onProgressClick: function(event) {
            if(this._isVideo && this._video.readyState === this._video.HAVE_ENOUGH_DATA) {
                var percent =  this.relativeX / $(this.element).find('canvas').width() * 100;
                $(this.element).find('.controlsWrapper > .valiant-progress-bar')[0].children[0].setAttribute("style", "width:" + percent + "%;");
                $(this.element).find('.controlsWrapper > .valiant-progress-bar')[0].children[1].setAttribute("style", "width:" + (100 - percent) + "%;");
                this._video.currentTime = this._video.duration * percent / 100;
            }
        },
		
		onProgressMouseMove: function(event){
			if(!this._isVideo) { return; } // there is no timeline to scrub for photo viewers
			var percent =  this.relativeX / $(this.element).find('canvas').width() * 100;
			if(percent){
				var tooltip = $(this.element).find('.timeTooltip');
				var tooltipLeft = (this.relativeX - (tooltip.width()/2));
				tooltipLeft = tooltipLeft <0? 0:Math.min(tooltipLeft,$(this.element).find('canvas').width() - tooltip.outerWidth());
				tooltip.css({ left: tooltipLeft + 'px' });
				tooltip.show();
				var time = (percent / 100) * this._video.duration;
				var timeMin = Math.floor(time / 60);
				var timeSec = Math.floor(time - (timeMin * 60));
				tooltip.html(timeMin + ':' + (timeSec < 10 ? '0' + timeSec : timeSec));
			}
		},
		
		onProgressMouseOut: function (event) {
			$(this.element).find('.timeTooltip').hide();
		},

        onMouseUp: function(event) {
            this._mouseDown = false;
        },
		
		onKeyDown: function(event) {
		   var keyCode = event.keyCode;
		   if (keyCode >= 37 && keyCode <= 40) {
			   event.preventDefault();
			   this._keydown = true;
			   var pressEvent = document.createEvent('CustomEvent');
			   pressEvent.initCustomEvent("keyArrowPress",true,true,{'keyCode':keyCode});
			   this.element.dispatchEvent(pressEvent);
		   }
		},
		
		onKeyUp: function (event) {
		   var keyCode = event.keyCode;
		   if (keyCode >= 37 && keyCode <= 40) {
			   event.preventDefault();
			   this._keydown = false;
		   }
		},
		
		onKeyArrowPress: function (event) {
		   if (this._keydown) {
			   var keyCode = event.detail? event.detail.keyCode:null;
			   var offset = 3;
			   var pressDelay = 50;
			   var element = this.element;
			   event.preventDefault();
			   switch (keyCode) {
				   //Arrow left
				   case 37: this._lon -= offset;
					   break;
				   //Arrow right
				   case 39: this._lon += offset;
					   break;
				   //Arrow up
				   case 38: this._lat += offset;
					   break;
				   //Arrow down
				   case 40: this._lat -= offset;
					   break;
			   }
			   setTimeout(function () {
				   var pressEvent = document.createEvent('CustomEvent');
				   pressEvent.initCustomEvent("keyArrowPress",true,true,{'keyCode':keyCode});
				   element.dispatchEvent(pressEvent);
			   },
			   pressDelay);
		   }
	    },
		
		onVolumeMouseDown: function(event){
			event.preventDefault();
			this._volumeMouseDown = true;
			this.onVolumeMouseMove(event);
		},
		
		onVolumeMouseUp: function(event){
			event.preventDefault();
			this._volumeMouseDown = false;
		},
		
		onVolumeMouseMove: function(event){
			event.preventDefault();
			if(this._volumeMouseDown && this._isVideo){
				var volumeControl = $(this.element).find('.controlsWrapper .volumeControl');
				// use the event position directly; this.relativeX is relative to the
				// canvas, while offset() is relative to the document, so mixing them
				// made the volume track the mouse only at the page's left edge
				var percent =  (event.pageX - volumeControl.offset().left + (volumeControl.find('.volumeBar > .volumeCursor').width()/2)) / volumeControl.width() * 100;
				if(percent>=0 && percent<=100){
					this._video.volume = percent/100;
				}
			}
		},
		
		onVolumeChange: function(event){
			//change volume cursor value
			var percent = this._video.muted==true && !this._volumeMouseDown? 0:(this._video.volume * 100);			
			$(this.element).find('.controlsWrapper .volumeControl > .volumeBar').css({width: percent+"%"});
			
			//change mute button
			var muteButton = $(this.element).find(".muteButton");
			if((percent>0 && muteButton.hasClass('fa-volume-off')) || (percent==0 && muteButton.hasClass('fa-volume-up'))){
				muteButton.click();
			}
		},

        startAnimation: function() {
            // modern three.js drives the render loop itself, which is required for
            // WebXR (the headset supplies the frame timing). Fall back to a plain
            // requestAnimationFrame loop for older builds.
            if(this._renderer.setAnimationLoop) {
                this._usingAnimationLoop = true;
                this._renderer.setAnimationLoop( this.animate.bind(this) );
            } else {
                this._usingAnimationLoop = false;
                this._requestAnimationId = requestAnimationFrame( this.animate.bind(this) );
            }
        },

        animate: function() {
            // when three.js owns the loop it schedules the next frame for us
            if( ! this._usingAnimationLoop ) {
                this._requestAnimationId = requestAnimationFrame( this.animate.bind(this) );
            }

            if( this._isVideo ) {
                if ( this._video.readyState === this._video.HAVE_ENOUGH_DATA) {
					if(this._videocanvas) {
                        this._videocanvas.getContext('2d').drawImage(this._video, 0, 0, this._videocanvas.width, this._videocanvas.height);
                    }
                    if(typeof(this._texture) !== "undefined" ) {
                        var ct = new Date().getTime();
                        if(ct - this._time >= 30) {
                            this._texture.needsUpdate = true;
                            this._time = ct;
                        }
                    }
                }
            }

            this.render();
        },

        render: function() {
            // While an immersive session is running the headset owns the camera, so
            // instead of moving the camera we rotate the panorama to match lon/lat.
            if( this._isXRPresenting ) {
                this.updateXRView();
                this._renderer.render( this._scene, this._camera );
                return;
            }

            this._lat = Math.max( - 85, Math.min( 85, this._lat ) );
            this._phi = ( 90 - this._lat ) * Math.PI / 180;
            this._theta = this._lon * Math.PI / 180;

            var cx = 500 * Math.sin( this._phi ) * Math.cos( this._theta );
            var cy = 500 * Math.cos( this._phi );
            var cz = 500 * Math.sin( this._phi ) * Math.sin( this._theta );

            this._camera.lookAt(new THREE.Vector3(cx, cy, cz));

            // distortion
            if(this.options.flatProjection) {
                this._camera.position.x = 0;
                this._camera.position.y = 0;
                this._camera.position.z = 0;
            } else {
                this._camera.position.x = - cx;
                this._camera.position.y = - cy;
                this._camera.position.z = - cz;
            }

            this._renderer.clear();
            this._renderer.render( this._scene, this._camera );
        },

        // Video specific functions, exposed to controller
        play: function() {
            //code to play media
            this._video.play();
        },

        pause: function() {
            //code to stop media
            this._video.pause();
        },

        loadVideo: function(videoFile) {
            this._video.src = videoFile;
        },
        unloadVideo: function() {
            // overkill unloading to avoid dreaded video 'pending' bug in Chrome. See https://code.google.com/p/chromium/issues/detail?id=234779
            this.pause();
            this._video.src = '';
            this._video.removeAttribute('src');
        },
        loadPhoto: function(photoFile) {
            this._texture = this.loadTexture( photoFile );
            if(this._mesh) {
                this._mesh.material.map = this._texture;
                this._mesh.material.needsUpdate = true;
            }
        },

        fullscreen: function() {
            if($(this.element).find('a.fa-expand').length > 0) {
                this.resizeGL(screen.width, screen.height);

                $(this.element).addClass('fullscreen');
                $(this.element).find('a.fa-expand').removeClass('fa-expand').addClass('fa-compress');

                this._isFullscreen = true;
            } else {
                this.resizeGL(this._originalWidth, this._originalHeight);

                $(this.element).removeClass('fullscreen');
                $(this.element).find('a.fa-compress').removeClass('fa-compress').addClass('fa-expand');

                this._isFullscreen = false;
            }
        },

        resizeGL: function(w, h) {
            this._renderer.setSize(w, h);
            this._camera.aspect = w / h;
            this._camera.updateProjectionMatrix();
        },
		
		showWaiting: function () {
			var loading = $(this.element).find('.loading');
            loading.find('.waiting-icon').show();
            loading.find('.error-icon').hide();
            loading.show();
        },

        hideWaiting: function () {
            $(this.element).find('.loading').hide();
        },

        showError: function () {
			var loading = $(this.element).find('.loading');
            loading.find('.waiting-icon').hide();
            loading.find('.error-icon').show();
            loading.show();
        },

        destroy: function() {
            if(!this._renderer) {
                return;
            }
            if(this._renderer.setAnimationLoop) {
                this._renderer.setAnimationLoop( null );
            } else {
                window.cancelAnimationFrame(this._requestAnimationId);
            }
            this._requestAnimationId = '';
            this.exitVR();

            // unbind the listeners we registered, otherwise a destroyed player
            // keeps reacting to input and global events (and throws, since its
            // canvas is gone)
            if(this._listeners) {
                for(var i = 0; i < this._listeners.length; i++) {
                    var listener = this._listeners[i];
                    listener[0].removeEventListener(listener[1], listener[2], listener[3]);
                }
                this._listeners = [];
            }
            if(this._fullscreenHandler) {
                $(document).off('webkitfullscreenchange mozfullscreenchange fullscreenchange MSFullscreenChange', this._fullscreenHandler);
            }
            if(this._resizeHandler) {
                $(window).off('resize', this._resizeHandler);
            }

            if(this._texture) {
                this._texture.dispose();
            }
            this._scene.remove(this._meshGroup || this._mesh);
            if(this._isVideo) {
                this.unloadVideo();
            }
            $(this._renderer.domElement).remove();
        }
    };

    $.fn[pluginName] = function ( options ) {
        return this.each(function () {
            if(typeof options === 'object' || !options) {
                // A really lightweight plugin wrapper around the constructor,
                // preventing against multiple instantiations
                this.plugin = new Plugin(this, options);
                if (!$.data(this, "plugin_" + pluginName)) {
                    $.data(this, "plugin_" + pluginName, this.plugin);
                }
            } else if(this.plugin[options]) {
                // Allows plugin methods to be called
                return this.plugin[options].apply(this.plugin, Array.prototype.slice.call(arguments, 1))
            }
        });
    };

})( jQuery, THREE, Detector, window, document );

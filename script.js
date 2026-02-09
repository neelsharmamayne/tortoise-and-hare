    (function() {
      'use strict';

      // ===== 1. Initialize path lengths for stroke-dashoffset animation =====
      function initPathLengths() {
        document.querySelectorAll('.draw-path').forEach(function(el) {
          try {
            if (typeof el.getTotalLength === 'function') {
              var length = el.getTotalLength();
              el.style.setProperty('--path-length', length);
              el.style.strokeDasharray = length;
              el.style.strokeDashoffset = length;
            }
          } catch(e) {
            // Some elements (text, circles) may not support getTotalLength
          }
        });
      }

      // ===== 2. Hand-drawn wobble effect =====
      function applyWobble() {
        var ROUGHNESS = 1.2;
        document.querySelectorAll('.draw-path').forEach(function(path) {
          var d = path.getAttribute('d');
          if (!d) return;

          // Only wobble actual path elements, skip text
          if (path.tagName.toLowerCase() === 'text') return;

          var wobbled = d.replace(
            /(-?\d+\.?\d*)\s*,?\s*(-?\d+\.?\d*)/g,
            function(match, x, y) {
              var nx = parseFloat(x) + (Math.random() - 0.5) * ROUGHNESS * 2;
              var ny = parseFloat(y) + (Math.random() - 0.5) * ROUGHNESS * 2;
              return nx.toFixed(1) + ',' + ny.toFixed(1);
            }
          );
          path.setAttribute('d', wobbled);
        });

        // Also wobble color-fill paths that have a d attribute
        document.querySelectorAll('.color-fill[d]').forEach(function(path) {
          if (path.classList.contains('draw-path')) return; // already wobbled
          var d = path.getAttribute('d');
          if (!d) return;
          var wobbled = d.replace(
            /(-?\d+\.?\d*)\s*,?\s*(-?\d+\.?\d*)/g,
            function(match, x, y) {
              var nx = parseFloat(x) + (Math.random() - 0.5) * ROUGHNESS * 2;
              var ny = parseFloat(y) + (Math.random() - 0.5) * ROUGHNESS * 2;
              return nx.toFixed(1) + ',' + ny.toFixed(1);
            }
          );
          path.setAttribute('d', wobbled);
        });
      }

      // ===== 3. Feature detection and fallback =====
      function supportsScrollTimeline() {
        try {
          return CSS.supports('animation-timeline', 'view()');
        } catch(e) {
          return false;
        }
      }

      function initJSFallback() {
        document.documentElement.classList.add('js-scroll-fallback');

        var scenes = document.querySelectorAll('.scene');
        var ticking = false;

        function updateScrollProgress() {
          var scrollTop = window.scrollY || window.pageYOffset;
          var docHeight = document.documentElement.scrollHeight - window.innerHeight;
          if (docHeight <= 0) return;

          scenes.forEach(function(scene) {
            var rect = scene.getBoundingClientRect();
            var vh = window.innerHeight;

            // 0 = just entering bottom, 1 = fully exited top
            var progress = Math.max(0, Math.min(1,
              (vh - rect.top) / (vh + rect.height)
            ));

            // Scene canvas fade-in
            var canvas = scene.querySelector('.scene__canvas');
            if (canvas) {
              var canvasProgress = Math.max(0, Math.min(1, progress / 0.35));
              canvas.style.opacity = canvasProgress;
              canvas.style.transform = 'translateY(' + (40 * (1 - canvasProgress)) + 'px)';
            }

            // Wash background
            var washProgress = Math.max(0, Math.min(1, progress / 0.5));
            scene.style.setProperty('--wash-opacity', washProgress * 0.55);
            scene.style.setProperty('--wash-scale', 0.85 + washProgress * 0.2);
            // Apply to ::before via CSS variable approach
            // For the ::before pseudo, we use a different strategy:
            // We add inline style to the scene with a CSS variable
            if (scene.style) {
              // We need a different approach for pseudo-elements
              // We'll modify scene's opacity through a data attribute
              scene.setAttribute('data-progress', progress.toFixed(3));
            }

            // Draw paths
            var drawPaths = scene.querySelectorAll('.draw-path');
            drawPaths.forEach(function(path, index) {
              var stagger = parseInt(path.getAttribute('data-stagger') || '0') * 0.04;
              var pathProgress = Math.max(0, Math.min(1,
                (progress - 0.05 - stagger) / 0.5
              ));
              var length = parseFloat(path.style.getPropertyValue('--path-length')) || 0;
              if (length > 0) {
                path.style.strokeDashoffset = length * (1 - pathProgress);
              }
            });

            // Color fills
            var fills = scene.querySelectorAll('.color-fill');
            fills.forEach(function(fill, index) {
              var stagger = parseInt(fill.getAttribute('data-stagger') || '0') * 0.03;
              var fillProgress = Math.max(0, Math.min(1,
                (progress - 0.35 - stagger) / 0.45
              ));
              fill.style.fillOpacity = fillProgress * 0.85;
              var blurAmount = (1 - fillProgress) * 8;
              if (blurAmount > 0.5) {
                fill.style.filter = 'blur(' + blurAmount.toFixed(1) + 'px)';
              } else {
                fill.style.filter = 'none';
              }
            });

            // Text reveal (smooth fade + slide up + blur)
            var texts = scene.querySelectorAll('.story-text');
            texts.forEach(function(text) {
              var textProgress = Math.max(0, Math.min(1,
                (progress - 0.25) / 0.45
              ));
              var yOffset = (1 - textProgress) * 12;
              var blurAmount = (1 - textProgress) * 4;
              text.style.opacity = textProgress;
              text.style.transform = 'translateY(' + yOffset + 'px)';
              text.style.filter = blurAmount > 0.1 ? 'blur(' + blurAmount.toFixed(1) + 'px)' : 'none';
            });
          });

          // Handle walk-motion for scene 7
          var walkEl = document.querySelector('.walk-motion');
          if (walkEl) {
            var scene7 = document.getElementById('scene-tortoise-passes');
            if (scene7) {
              var rect7 = scene7.getBoundingClientRect();
              var vh7 = window.innerHeight;
              var p7 = Math.max(0, Math.min(1,
                (vh7 - rect7.top) / (vh7 + rect7.height)
              ));
              var xPos = 80 - (p7 * 110); // 80% to -30%
              walkEl.style.transform = 'translateX(' + xPos + '%)';
            }
          }
        }

        window.addEventListener('scroll', function() {
          if (!ticking) {
            requestAnimationFrame(function() {
              updateScrollProgress();
              ticking = false;
            });
            ticking = true;
          }
        }, { passive: true });

        // Also handle the ::before pseudo-elements via a style injection
        var fallbackStyle = document.createElement('style');
        fallbackStyle.textContent = `
          .js-scroll-fallback .scene::before {
            animation: none !important;
            opacity: 0.55;
            transform: scale(1.05);
            transition: opacity 0.3s ease;
          }
          .js-scroll-fallback .walk-motion {
            animation: none !important;
            transition: transform 0.15s linear;
          }
          .js-scroll-fallback .moral-anim {
            animation: none !important;
          }
          .js-scroll-fallback .title-anim {
            animation: none !important;
          }
          .js-scroll-fallback .confetti {
            animation: none !important;
          }
          .js-scroll-fallback .speed-line {
            animation: none !important;
          }
          .js-scroll-fallback .dust {
            animation: none !important;
          }
        `;
        document.head.appendChild(fallbackStyle);

        // Initial call
        updateScrollProgress();
      }

      // ===== Initialize =====

      // Apply wobble first (before measuring path lengths)
      applyWobble();

      // Then measure path lengths
      initPathLengths();

      // Feature detection
      if (!supportsScrollTimeline()) {
        // Try the polyfill
        var script = document.createElement('script');
        script.src = 'https://flackr.github.io/scroll-timeline/dist/scroll-timeline.js';
        script.onload = function() {
          // Polyfill loaded successfully — it auto-patches CSS
          console.log('Scroll-timeline polyfill loaded');
        };
        script.onerror = function() {
          // Polyfill failed, use JS fallback
          console.log('Using JS scroll fallback');
          initJSFallback();
        };
        document.head.appendChild(script);

        // If polyfill takes too long, fall back after 3 seconds
        setTimeout(function() {
          if (!supportsScrollTimeline() && !document.documentElement.classList.contains('js-scroll-fallback')) {
            // Check if polyfill actually worked by testing an element
            var testEl = document.querySelector('.draw-path');
            if (testEl) {
              var computed = getComputedStyle(testEl);
              // If stroke-dashoffset is still at full length, polyfill didn't work
              var offset = parseFloat(computed.strokeDashoffset);
              var length = parseFloat(testEl.style.getPropertyValue('--path-length'));
              if (offset === length || isNaN(offset)) {
                console.log('Polyfill appears non-functional, activating JS fallback');
                initJSFallback();
              }
            }
          }
        }, 3500);
      }

      // ===== 4. Floating character waypoint animation =====
      function initFloatingCharacters() {
        var tortoise = document.getElementById('floating-tortoise');
        var hare = document.getElementById('floating-hare');
        if (!tortoise || !hare) return;

        var scenes = document.querySelectorAll('.scene');
        var sceneIds = Array.from(scenes).map(function(s) { return s.id; });

        // Waypoints: define where each character should be at each scene
        // Values are percentages of viewport: { x: left%, y: top%, scale, opacity }
        // x/y are the center position of the character as % of viewport
        var tortoiseWaypoints = [
          { scene: 'scene-title',            x: 28, y: 72, scale: 0.7, opacity: 0.9 },
          { scene: 'scene-intro',            x: 28, y: 68, scale: 1.0, opacity: 1.0 },
          { scene: 'scene-challenge',        x: 65, y: 62, scale: 1.0, opacity: 1.0 },
          { scene: 'scene-training',         x: 55, y: 58, scale: 1.1, opacity: 1.0 },
          { scene: 'scene-race-start',       x: 25, y: 68, scale: 0.9, opacity: 1.0 },
          { scene: 'scene-hare-stops',       x: 85, y: 72, scale: 0.5, opacity: 0.6 },
          { scene: 'scene-hare-snacks',      x: 80, y: 70, scale: 0.55, opacity: 0.7 },
          { scene: 'scene-hare-nap',         x: -10, y: 70, scale: 0.5, opacity: 0.0 },
          { scene: 'scene-tortoise-passes',  x: 55, y: 65, scale: 1.1, opacity: 1.0 },
          { scene: 'scene-finish',           x: 48, y: 52, scale: 1.3, opacity: 1.0 },
          { scene: 'scene-moral',            x: 50, y: 50, scale: 1.2, opacity: 1.0 }
        ];

        var hareWaypoints = [
          { scene: 'scene-title',            x: 65, y: 68, scale: 0.7, opacity: 0.9 },
          { scene: 'scene-intro',            x: 65, y: 58, scale: 1.0, opacity: 1.0 },
          { scene: 'scene-challenge',        x: 30, y: 50, scale: 1.2, opacity: 1.0 },
          { scene: 'scene-training',         x: 85, y: 65, scale: 0.6, opacity: 0.5 },
          { scene: 'scene-race-start',       x: 33, y: 60, scale: 0.9, opacity: 1.0 },
          { scene: 'scene-hare-stops',       x: 45, y: 55, scale: 1.1, opacity: 1.0 },
          { scene: 'scene-hare-snacks',      x: 42, y: 55, scale: 1.1, opacity: 1.0 },
          { scene: 'scene-hare-nap',         x: 42, y: 62, scale: 0.9, opacity: 1.0 },
          { scene: 'scene-tortoise-passes',  x: 28, y: 68, scale: 0.6, opacity: 0.7 },
          { scene: 'scene-finish',           x: 12, y: 62, scale: 0.5, opacity: 0.8 },
          { scene: 'scene-moral',            x: 80, y: 72, scale: 0.4, opacity: 0.5 }
        ];

        function getSceneProgress() {
          // Returns a continuous 0-to-(N-1) value indicating which scene we're in
          // and how far through it we are (e.g., 2.5 = halfway through scene 3)
          var scrollTop = window.scrollY || window.pageYOffset;
          var results = [];

          for (var i = 0; i < scenes.length; i++) {
            var rect = scenes[i].getBoundingClientRect();
            var vh = window.innerHeight;
            // Scene center is at 50% viewport
            var centerProgress = (vh * 0.5 - rect.top) / rect.height;
            results.push(centerProgress);
          }

          // Find which scene is most "current" — the one whose center is closest to being at viewport center
          var best = 0;
          for (var i = 0; i < results.length; i++) {
            if (results[i] >= 0 && results[i] <= 1) {
              return i + results[i];
            }
            if (results[i] > 1 && i === results.length - 1) {
              return i + Math.min(results[i], 1);
            }
          }

          // If we're above all scenes, return 0
          if (results[0] < 0) return results[0];
          // If we're below all scenes, return max
          return results.length - 1 + 1;
        }

        function lerp(a, b, t) {
          return a + (b - a) * t;
        }

        function easeInOutCubic(t) {
          return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        function interpolateWaypoint(waypoints, progress) {
          // progress is a float from 0 to (waypoints.length - 1)
          var idx = Math.floor(progress);
          var t = progress - idx;

          // Clamp
          if (idx < 0) { idx = 0; t = 0; }
          if (idx >= waypoints.length - 1) { idx = waypoints.length - 2; t = 1; }

          var a = waypoints[Math.max(0, idx)];
          var b = waypoints[Math.min(waypoints.length - 1, idx + 1)];

          var easedT = easeInOutCubic(t);

          return {
            x: lerp(a.x, b.x, easedT),
            y: lerp(a.y, b.y, easedT),
            scale: lerp(a.scale, b.scale, easedT),
            opacity: lerp(a.opacity, b.opacity, easedT)
          };
        }

        function applyWaypoint(el, wp) {
          var vw = window.innerWidth;
          var vh = window.innerHeight;
          var px = (wp.x / 100) * vw;
          var py = (wp.y / 100) * vh;

          el.style.left = px + 'px';
          el.style.top = py + 'px';
          el.style.transform = 'translate(-50%, -50%) scale(' + wp.scale.toFixed(3) + ')';
          el.style.opacity = Math.max(0, Math.min(1, wp.opacity)).toFixed(3);
        }

        var ticking2 = false;
        function updateFloatingCharacters() {
          var progress = getSceneProgress();

          var twp = interpolateWaypoint(tortoiseWaypoints, progress);
          var hwp = interpolateWaypoint(hareWaypoints, progress);

          applyWaypoint(tortoise, twp);
          applyWaypoint(hare, hwp);
        }

        window.addEventListener('scroll', function() {
          if (!ticking2) {
            requestAnimationFrame(function() {
              updateFloatingCharacters();
              ticking2 = false;
            });
            ticking2 = true;
          }
        }, { passive: true });

        // Also update on resize
        window.addEventListener('resize', function() {
          updateFloatingCharacters();
        }, { passive: true });

        // Initial position
        updateFloatingCharacters();

      }

      // ===== 5. Sidebar race tracker =====
      function initRaceTracker() {
        var tracker = document.getElementById('race-tracker');
        var racerTortoise = document.getElementById('racer-tortoise');
        var racerHare = document.getElementById('racer-hare');
        var dots = tracker ? tracker.querySelectorAll('.race-tracker__dot') : [];
        if (!tracker || !racerTortoise || !racerHare) return;

        // Show tracker after initial scroll
        var trackerShown = false;

        // Story-aligned waypoints for each scene dot (0-10)
        // Position is % along the track (0% = top, 100% = bottom/finish)
        // Dot positions: 0%, 10%, 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90%, 100%
        //
        // Scene 0  - Title:             Both at start, not racing yet
        // Scene 1  - Introduction:      Both together, before the race
        // Scene 2  - The Challenge:     Both together, hare boasting
        // Scene 3  - Training:          Pre-race, no movement yet
        // Scene 4  - Race Begins:       Both at starting line
        // Scene 5  - Hare Stops (Bear): Hare far ahead, tortoise plodding
        // Scene 6  - Hare Snacks:       Hare still ahead, tortoise catching up
        // Scene 7  - Hare Naps:         Hare stopped, tortoise past halfway
        // Scene 8  - Tortoise Passes:   Tortoise passes hare!
        // Scene 9  - The Finish:        Tortoise at 100% (wins!), hare at ~90%
        // Scene 10 - Moral:             Tortoise at finish, hare behind

        var tortoiseStops = [0, 5, 10, 12, 15, 25, 40, 55, 80, 100, 100];
        var hareStops     = [0, 5, 10, 10, 15, 50, 65, 65, 65,  90,  90];

        var scenes = document.querySelectorAll('.scene');

        function getSceneFloat() {
          // Returns a float 0.0 to 10.0 indicating which scene we're viewing
          for (var i = 0; i < scenes.length; i++) {
            var rect = scenes[i].getBoundingClientRect();
            var vh = window.innerHeight;
            var progress = (vh * 0.5 - rect.top) / rect.height;
            if (progress >= 0 && progress <= 1) {
              return i + progress;
            }
            if (progress > 1 && i === scenes.length - 1) {
              return i + Math.min(progress, 1);
            }
          }
          var firstRect = scenes[0].getBoundingClientRect();
          if (firstRect.top > window.innerHeight * 0.5) return 0;
          return scenes.length - 1;
        }

        function lerpStops(stops, sceneFloat) {
          var idx = Math.floor(sceneFloat);
          var t = sceneFloat - idx;
          if (idx < 0) { idx = 0; t = 0; }
          if (idx >= stops.length - 1) { idx = stops.length - 2; t = 1; }
          var a = stops[idx];
          var b = stops[idx + 1];
          // Ease for smoother movement
          var easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          return a + (b - a) * easedT;
        }

        function updateRace() {
          var scrollTop = window.scrollY || window.pageYOffset;
          var docHeight = document.documentElement.scrollHeight - window.innerHeight;
          if (docHeight <= 0) return;

          var globalProgress = scrollTop / docHeight;

          // Show tracker after 3% scroll
          if (!trackerShown && globalProgress > 0.03) {
            tracker.classList.add('visible');
            trackerShown = true;
          }

          // Get which scene we're in as a float (0.0 to 10.0)
          var sceneFloat = getSceneFloat();

          // Interpolate positions based on story waypoints
          var tortoisePos = lerpStops(tortoiseStops, sceneFloat);
          var harePos = lerpStops(hareStops, sceneFloat);

          // Clamp to 0-100%
          tortoisePos = Math.max(0, Math.min(100, tortoisePos));
          harePos = Math.max(0, Math.min(100, harePos));

          racerTortoise.style.top = tortoisePos + '%';
          racerHare.style.top = harePos + '%';

          // Update scene dots — mark as active when we've reached that scene
          var currentScene = Math.floor(sceneFloat);
          dots.forEach(function(dot, idx) {
            if (idx <= currentScene) {
              dot.classList.add('active');
            } else {
              dot.classList.remove('active');
            }
          });
        }

        var ticking3 = false;
        window.addEventListener('scroll', function() {
          if (!ticking3) {
            requestAnimationFrame(function() {
              updateRace();
              ticking3 = false;
            });
            ticking3 = true;
          }
        }, { passive: true });

        window.addEventListener('resize', updateRace, { passive: true });
        updateRace();
      }

      initRaceTracker();

      // Initialize floating characters (always — works alongside both CSS scroll-driven and JS fallback)
      initFloatingCharacters();

      // ===== 6. Snap coordination — smooth character landing on scene snap =====
      function initSnapCoordination() {
        var scenes = document.querySelectorAll('.scene');
        var currentSnappedScene = -1;
        var snapTimer = null;
        var supportsScrollEnd = 'onscrollend' in window;

        function onScrollSettled() {
          var vh = window.innerHeight;
          var bestScene = 0;
          var bestDist = Infinity;

          for (var i = 0; i < scenes.length; i++) {
            var rect = scenes[i].getBoundingClientRect();
            var center = rect.top + rect.height / 2;
            var dist = Math.abs(center - vh / 2);
            if (dist < bestDist) { bestDist = dist; bestScene = i; }
          }

          if (bestScene !== currentSnappedScene) {
            currentSnappedScene = bestScene;
            var t = document.getElementById('floating-tortoise');
            var h = document.getElementById('floating-hare');
            var trans = 'left 0.3s ease-out, top 0.3s ease-out, transform 0.3s ease-out, opacity 0.3s ease-out';
            if (t) t.style.transition = trans;
            if (h) h.style.transition = trans;
            setTimeout(function() {
              if (t) t.style.transition = 'none';
              if (h) h.style.transition = 'none';
            }, 350);
          }
        }

        if (supportsScrollEnd) {
          window.addEventListener('scrollend', onScrollSettled, { passive: true });
        } else {
          window.addEventListener('scroll', function() {
            clearTimeout(snapTimer);
            snapTimer = setTimeout(onScrollSettled, 150);
          }, { passive: true });
        }

        onScrollSettled();
      }

      initSnapCoordination();

      // Hide scroll hint after first scroll
      var scrollHint = document.querySelector('.scroll-hint');
      if (scrollHint) {
        var hintHidden = false;
        window.addEventListener('scroll', function() {
          if (!hintHidden && window.scrollY > 50) {
            scrollHint.style.transition = 'opacity 0.5s ease';
            scrollHint.style.opacity = '0';
            hintHidden = true;
          }
        }, { passive: true });
      }

    })();

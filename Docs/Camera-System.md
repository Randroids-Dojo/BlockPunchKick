# Camera System

The camera in Block Punch Kick uses an orbital system with dynamic zoom, implemented in `src/renderer3d.js`.

## Orbital Camera

The camera orbits around the ring's center point at a configurable angle and distance.

**State variables:**
- `cameraOrbitAngle` — current orbit angle (0 = front view, PI/2 = side)
- `cameraOrbitTarget` — target angle, smoothly interpolated toward
- `cameraRadius` — current zoom distance (8–40 units)
- `dynamicZoomTarget` — target zoom from fighter distance tracking
- `dynamicCameraX` — horizontal tracking offset (midpoint between fighters)

All values lerp toward their targets each frame for smooth motion (`CAMERA_LERP_SPEED = 0.08`).

## Dynamic Zoom

Samurai Shodown-style zoom that automatically adjusts based on fighter separation:

- **Close** (fighters < 0.8 units apart) → zoom to 14–18 (dramatic close-up)
- **Far** (fighters > 6.0 units apart) → zoom to 26–32 (wide shot)
- Embedded mode (iframe) uses wider zoom range (18–32)

Camera height also adjusts with zoom: closer = lower angle (3.0), pulled back = higher (5.0).

## Controls

| Input | Action |
|-------|--------|
| Scroll wheel | Zoom in/out |
| Right-click drag | Rotate orbit (desktop) |
| Two-finger pinch | Zoom (mobile) |
| Two-finger rotate | Rotate orbit (mobile) |
| Q / E keys | Rotate orbit left/right |

Controls are set up in `setupCameraControls()`, called during scene initialization.

## Compass Widget

A visual compass in the bottom-left corner of the screen that shows the current camera orbit angle and allows click/drag to rotate. Visible in both play and demo modes, hidden on the title screen.

**Implementation:** A 120x120 `<canvas>` element drawn each frame by `drawCompass()`.

**Visual elements:**
- Dark translucent circle with border
- 8 tick marks (4 major at cardinal directions, 4 minor)
- Blue triangle indicator pointing in the current camera direction
- Center dot

**Interaction:** Click or drag anywhere on the compass to set `cameraOrbitTarget` to the angle from the compass center to the pointer position. Uses `setPointerCapture` for smooth dragging.

**Visibility:** Controlled by `showCompass(visible, abovePanel)` — shown in play mode (bottom-left corner) and demo mode (raised above the demo panel via `above-panel` CSS class). Hidden on the title screen.

## Render Loop Integration

In `render3d()`, each frame:
1. Lerp `cameraRadius` toward `dynamicZoomTarget`
2. Lerp `cameraOrbitAngle` toward `cameraOrbitTarget`
3. Compute camera height from zoom level
4. Position camera: `x = dynamicCameraX + sin(angle) * radius`, `z = cos(angle) * radius`
5. Add screen shake offset
6. Look at tracked midpoint between fighters
7. Draw compass overlay

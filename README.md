# noting_down

Handwriting notes app (Tauri 2 + Svelte 5) for touchscreens with a passive stylus, with palm
rejection built in. Notes autosave to `~/Documents/noting_down/default.json`; Export PNG writes
next to it.

## App

```
npm install
npm run tauri dev        # run
npm run tauri build      # package (.deb/.AppImage/...)
npm test                 # palm filter + eraser tests
cd src-tauri && cargo test
```

Arch/Omarchy deps: `sudo pacman -S webkit2gtk-4.1 base-devel rust nodejs npm`.

### Palm rejection in the app (🖐 Palm button)

A passive pen arrives as `pointerType: "touch"`. The app classifies contacts two ways:
- **Contact size** (default): `PointerEvent.width/height` → pen / finger / palm using the two sliders.
  The panel shows the size of your last touch so you can set the thresholds.
- **Position fallback**: if the panel shows "≤1", WebKitGTK isn't reporting contact size. Untick
  "Use contact size": the topmost touch is the pen and anything lower (your hand) is ignored.
  A palm that lands first is replaced when the pen lands clearly above it.

Either way, rejected contacts stay rejected until they lift, and touches are blocked while the
pen is down and 0.35 s after. Real pens/mice always win. Not run on a real touchscreen yet.

If the webview can't give you sizes, the system-wide daemon below filters at the evdev level
(sees real `TOUCH_MAJOR`) and works with any app, this one included.

## System-wide daemon (`daemon/`)

# palm rejection daemon for passive-stylus touchscreens

A passive/capacitive pen is just "a finger" to Linux, so libinput can't tell pen from palm
(its palm detection only covers touchpads). `daemon/palmreject.py` fixes that in userspace:
it grabs the touchscreen, classifies contacts by size, and forwards only the right ones
through a virtual touchscreen.

Rules
- small contact → **pen**; medium → **finger**; large → **palm** (rejected for its whole life)
- while the pen is down (and 0.35 s after it lifts) all non-pen contacts are rejected and stay
  rejected until lifted, so a resting hand never "wakes up" afterwards
- a finger that grows into a palm is dropped; a palm already down when the pen lands is ignored
- `--pen-only` ignores everything but the pen (toggle live with `pkill -USR1 -f palmreject`)

## Install (Arch / Omarchy)

```
sudo pacman -S python-evdev
sudo modprobe uinput
sudo python daemon/palmreject.py --list          # find your touchscreen
sudo python daemon/palmreject.py --calibrate     # touch with pen, finger, palm; note the numbers
sudo python daemon/palmreject.py --pen-max 12 --palm-min 40
```

Defaults are 10 % / 25 % of the axis range, which is only a guess: **calibrate** and pass real
values. If calibrate says there's no `ABS_MT_TOUCH_MAJOR`, size-based rejection isn't possible on
that panel (send me the `evtest` output).

Run at boot: copy `daemon/palmreject.service` to `/etc/systemd/system/`, edit the ExecStart line, then
`sudo systemctl enable --now palmreject`.

## Hyprland (Omarchy)

The virtual device is named `<original name> (palmreject)`. Bind it to your screen in
`~/.config/hypr/hyprland.conf`, otherwise touch may map across all monitors:

```
device {
    name = <original name> (palmreject)
    output = eDP-1
}
```

The original device is grabbed, so Hyprland only sees the filtered one.

## Writing app

Any app that treats touch as a pen works (Xournal++, Rnote, Saber, Krita). In Xournal++ set
Preferences → Input Devices → Touchscreen to "Pen" (or enable touch drawing). Since the
filter handles rejection, you can leave touch input on.

## Tests

`pip install pytest && pytest daemon` – covers the classification logic (no hardware needed).
The evdev/uinput layer is untested on real hardware, so expect to tune thresholds.

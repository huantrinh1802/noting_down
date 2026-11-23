# noting_down – palm rejection for passive-stylus touchscreens

A passive/capacitive pen is just "a finger" to Linux, so libinput can't tell pen from palm
(its palm detection only covers touchpads). `palmreject.py` fixes that in userspace:
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
sudo python palmreject.py --list          # find your touchscreen
sudo python palmreject.py --calibrate     # touch with pen, finger, palm; note the numbers
sudo python palmreject.py --pen-max 12 --palm-min 40
```

Defaults are 10 % / 25 % of the axis range, which is only a guess: **calibrate** and pass real
values. If calibrate says there's no `ABS_MT_TOUCH_MAJOR`, size-based rejection isn't possible on
that panel (send me the `evtest` output).

Run at boot: copy `palmreject.service` to `/etc/systemd/system/`, edit the ExecStart line, then
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

`pip install pytest && pytest` – covers the classification logic (no hardware needed).
The evdev/uinput layer is untested on real hardware, so expect to tune thresholds.

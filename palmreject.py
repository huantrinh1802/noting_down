#!/usr/bin/env python3
"""palmreject - software palm rejection for touchscreens used with a passive stylus.

A passive/capacitive pen looks like a finger to the kernel, so nothing marks a
contact as "the pen". This daemon grabs the real touchscreen, classifies every
contact by its size (ABS_MT_TOUCH_MAJOR), and re-emits only the contacts that
should count through a virtual touchscreen (uinput):

  * pen    - small contact (the stylus tip)
  * finger - medium contact
  * palm   - large contact, or any finger that lands/touches while the pen is
             down (or just lifted). A palm is rejected for its whole lifetime.

Usage:
  sudo palmreject.py --list
  sudo palmreject.py --calibrate            # shows contact sizes; touch with pen/finger/palm
  sudo palmreject.py                        # run with defaults
  sudo palmreject.py --pen-only             # ignore everything except the pen
Send SIGUSR1 to toggle pen-only mode while running.
"""
import argparse
import signal
import sys
import time

PEN, FINGER, PALM = "pen", "finger", "palm"


class PalmFilter:
    """Pure logic, no I/O. Feed it one frame at a time."""

    def __init__(self, pen_max, palm_min, hold=0.35, pen_only=False):
        self.pen_max = pen_max      # contact major <= this  -> pen
        self.palm_min = palm_min    # contact major >= this  -> palm
        self.hold = hold            # seconds after pen lifts that fingers stay blocked
        self.pen_only = pen_only
        self.cls = {}               # slot -> PEN / FINGER / PALM (latched)
        self.pen_until = 0.0

    def _pen_active(self):
        return any(c == PEN for c in self.cls.values())

    def update(self, now, contacts):
        """contacts: {slot: major} for every slot currently touching.
        Returns the set of slots that should be forwarded."""
        # forget lifted slots; start the hold timer when the last pen lifts
        for slot in [s for s in self.cls if s not in contacts]:
            if self.cls.pop(slot) == PEN:
                self.pen_until = now + self.hold

        # classify new contacts (pens first so a pen in the same frame wins)
        new = sorted((s for s in contacts if s not in self.cls),
                     key=lambda s: contacts[s] > self.pen_max)
        for slot in new:
            major = contacts[slot]
            if major >= self.palm_min:
                self.cls[slot] = PALM
            elif major <= self.pen_max:
                self.cls[slot] = PEN
            else:
                self.cls[slot] = FINGER

        # a finger that grows into a palm becomes a palm
        for slot, c in list(self.cls.items()):
            if c == FINGER and contacts[slot] >= self.palm_min:
                self.cls[slot] = PALM

        # pen present (or just lifted): every non-pen contact is latched as palm
        if self._pen_active() or now < self.pen_until or self.pen_only:
            for slot, c in self.cls.items():
                if c == FINGER:
                    self.cls[slot] = PALM

        return {s for s, c in self.cls.items() if c in (PEN, FINGER)}


# ----------------------------------------------------------------------------
# evdev / uinput glue
# ----------------------------------------------------------------------------

def find_touchscreens():
    from evdev import InputDevice, ecodes, list_devices
    out = []
    for path in list_devices():
        dev = InputDevice(path)
        caps = dev.capabilities().get(ecodes.EV_ABS, [])
        codes = {c for c, _ in caps}
        if ecodes.ABS_MT_POSITION_X in codes and ecodes.ABS_MT_SLOT in codes \
                and ecodes.BTN_TOUCH in dev.capabilities().get(ecodes.EV_KEY, []):
            out.append(dev)
    return out


def pick_device(name):
    devs = find_touchscreens()
    if name:
        devs = [d for d in devs if name.lower() in d.name.lower() or d.path == name]
    if not devs:
        sys.exit("No touchscreen found. Try --list (needs root to read /dev/input).")
    return devs[0]


def axis_info(dev, code):
    from evdev import ecodes  # noqa
    for c, info in dev.capabilities().get(3, []):
        if c == code:
            return info
    return None


def calibrate(dev):
    from evdev import ecodes
    major = axis_info(dev, ecodes.ABS_MT_TOUCH_MAJOR)
    if major is None:
        sys.exit("This touchscreen does not report ABS_MT_TOUCH_MAJOR; size-based "
                 "rejection is impossible. Try --pen-only with ABS_MT_PRESSURE or "
                 "open an issue with `evtest` output.")
    print(f"{dev.name}: TOUCH_MAJOR range {major.min}..{major.max}")
    print("Touch with the pen, a finger, then a resting palm. Ctrl-C to stop.\n")
    seen = {}
    slot = 0
    for ev in dev.read_loop():
        if ev.type == ecodes.EV_ABS:
            if ev.code == ecodes.ABS_MT_SLOT:
                slot = ev.value
            elif ev.code == ecodes.ABS_MT_TOUCH_MAJOR:
                seen[slot] = ev.value
                print(f"slot {slot}: major={ev.value}", flush=True)


def run(dev, args):
    from evdev import AbsInfo, UInput, ecodes as e

    major_info = axis_info(dev, e.ABS_MT_TOUCH_MAJOR)
    if major_info is None:
        sys.exit("No ABS_MT_TOUCH_MAJOR on this device; run --calibrate to confirm.")
    span = major_info.max - major_info.min or 1
    pen_max = args.pen_max if args.pen_max is not None else major_info.min + 0.10 * span
    palm_min = args.palm_min if args.palm_min is not None else major_info.min + 0.25 * span
    filt = PalmFilter(pen_max, palm_min, hold=args.hold, pen_only=args.pen_only)
    print(f"pen<= {pen_max:.0f}  palm>= {palm_min:.0f}  hold={args.hold}s  "
          f"pen_only={args.pen_only}", flush=True)

    caps = dev.capabilities(absinfo=True)
    caps.pop(e.EV_SYN, None)
    ui = UInput(caps, name=f"{dev.name} (palmreject)",
                vendor=dev.info.vendor, product=dev.info.product, version=dev.info.version)
    dev.grab()

    def toggle(*_):
        filt.pen_only = not filt.pen_only
        print(f"pen_only={filt.pen_only}", flush=True)
    signal.signal(signal.SIGUSR1, toggle)

    n_slots = axis_info(dev, e.ABS_MT_SLOT).max + 1
    raw = [dict(down=False, x=0, y=0, major=0, pressure=None) for _ in range(n_slots)]
    sent = {}          # slot -> (x, y, major) last forwarded; present = forwarded as down
    next_id = [1]
    slot = 0

    def emit_frame(now):
        contacts = {s: r["major"] for s, r in enumerate(raw) if r["down"]}
        allowed = filt.update(now, contacts)
        for s in range(n_slots):
            r = raw[s]
            if s in sent and s not in allowed:               # lift
                ui.write(e.EV_ABS, e.ABS_MT_SLOT, s)
                ui.write(e.EV_ABS, e.ABS_MT_TRACKING_ID, -1)
                del sent[s]
            elif s in allowed:
                cur = (r["x"], r["y"], r["major"])
                if s not in sent:                             # down
                    ui.write(e.EV_ABS, e.ABS_MT_SLOT, s)
                    ui.write(e.EV_ABS, e.ABS_MT_TRACKING_ID, next_id[0])
                    next_id[0] += 1
                elif sent[s] == cur:
                    continue
                else:
                    ui.write(e.EV_ABS, e.ABS_MT_SLOT, s)
                ui.write(e.EV_ABS, e.ABS_MT_POSITION_X, r["x"])
                ui.write(e.EV_ABS, e.ABS_MT_POSITION_Y, r["y"])
                ui.write(e.EV_ABS, e.ABS_MT_TOUCH_MAJOR, r["major"])
                sent[s] = cur
        ui.write(e.EV_KEY, e.BTN_TOUCH, 1 if sent else 0)
        ui.syn()

    try:
        for ev in dev.read_loop():
            if ev.type == e.EV_ABS:
                if ev.code == e.ABS_MT_SLOT:
                    slot = ev.value
                elif ev.code == e.ABS_MT_TRACKING_ID:
                    raw[slot]["down"] = ev.value != -1
                    if ev.value == -1:
                        raw[slot]["major"] = 0
                elif ev.code == e.ABS_MT_POSITION_X:
                    raw[slot]["x"] = ev.value
                elif ev.code == e.ABS_MT_POSITION_Y:
                    raw[slot]["y"] = ev.value
                elif ev.code == e.ABS_MT_TOUCH_MAJOR:
                    raw[slot]["major"] = ev.value
            elif ev.type == e.EV_SYN and ev.code == e.SYN_REPORT:
                emit_frame(time.monotonic())
    finally:
        try:
            dev.ungrab()
        except OSError:
            pass
        ui.close()


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    p.add_argument("--device", help="touchscreen name substring or /dev/input/eventN")
    p.add_argument("--list", action="store_true")
    p.add_argument("--calibrate", action="store_true")
    p.add_argument("--pen-only", action="store_true", help="only forward pen contacts")
    p.add_argument("--pen-max", type=float, help="max TOUCH_MAJOR counted as pen")
    p.add_argument("--palm-min", type=float, help="min TOUCH_MAJOR counted as palm")
    p.add_argument("--hold", type=float, default=0.35,
                   help="seconds fingers stay blocked after the pen lifts (default 0.35)")
    args = p.parse_args()

    if args.list:
        for d in find_touchscreens():
            print(d.path, d.name)
        return
    dev = pick_device(args.device)
    if args.calibrate:
        calibrate(dev)
    else:
        run(dev, args)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass

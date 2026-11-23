from palmreject import PalmFilter


def mk():
    return PalmFilter(pen_max=10, palm_min=40, hold=0.3)


def test_pen_allowed_palm_rejected():
    f = mk()
    assert f.update(0.0, {0: 5}) == {0}
    assert f.update(0.1, {0: 5, 1: 80}) == {0}          # big palm blob ignored
    assert f.update(0.2, {1: 80}) == set()


def test_palm_landing_first_then_pen():
    f = mk()
    assert f.update(0.0, {0: 80}) == set()
    assert f.update(0.1, {0: 80, 1: 5}) == {1}


def test_finger_touching_while_pen_down_is_latched_palm():
    f = mk()
    f.update(0.0, {0: 5})
    assert f.update(0.1, {0: 5, 1: 25}) == {0}
    # pen lifts; the resting hand must not "wake up" as a finger
    assert f.update(1.0, {1: 25}) == set()


def test_existing_finger_dropped_when_pen_lands():
    f = mk()
    assert f.update(0.0, {0: 25}) == {0}
    assert f.update(0.1, {0: 25, 1: 5}) == {1}


def test_hold_after_pen_lift_blocks_new_fingers():
    f = mk()
    f.update(0.0, {0: 5})
    f.update(0.1, {})
    assert f.update(0.2, {1: 25}) == set()              # within hold
    f.update(0.3, {})
    assert f.update(0.9, {2: 25}) == {2}                # after hold: normal finger


def test_finger_growing_into_palm():
    f = mk()
    assert f.update(0.0, {0: 25}) == {0}
    assert f.update(0.1, {0: 60}) == set()


def test_pen_only_mode():
    f = PalmFilter(10, 40, pen_only=True)
    assert f.update(0.0, {0: 25}) == set()
    assert f.update(0.1, {0: 25, 1: 5}) == {1}

#!/usr/bin/env python3
"""Install or remove FlexTile and hand its shortcuts the keys they need.

Plasma already uses some of the usual tiling keys (Meta+arrows for quick
tiling, Meta+1..9 for task manager entries, Meta+G for the grid view...).
Before giving a key to FlexTile, the key is removed from whatever action held
it, and that action's original keys are saved so `uninstall` can give them
back. Only the conflicting key is removed: Window Close keeps Alt+F4, etc.

Talks to KGlobalAccel through `gdbus`, whose GVariant text output is close
enough to Python literals to read with ast.literal_eval.
"""

import argparse
import ast
import ctypes
import ctypes.util
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

PLUGIN = "flextile"
REPO = Path(__file__).resolve().parent.parent
PACKAGE = REPO / "package"
DATA_HOME = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local/share")
STATE_DIR = DATA_HOME / "flextile"
BACKUP = STATE_DIR / "backup.json"

META, SHIFT, CTRL, ALT = 0x10000000, 0x02000000, 0x04000000, 0x08000000
SPECIAL = {"Left": 0x01000012, "Up": 0x01000013, "Right": 0x01000014,
           "Down": 0x01000015, "Space": 0x20}

# Keep in sync with the defaults in package/contents/code/main.js.
BINDINGS = {
    "Toggle Tiling": ["Meta+Y"],
    "Toggle Floating": ["Meta+G"],
    "Toggle Orientation": ["Meta+O"],
    "Toggle Maximize": ["Meta+M"],
    "Minimize": ["Meta+H"],
    "Close": ["Meta+Q"],
}
for _d in ("Left", "Right", "Up", "Down"):
    BINDINGS["Focus " + _d] = ["Meta+" + _d]
    BINDINGS["Move " + _d] = ["Meta+Shift+" + _d]
for _n in range(1, 10):
    BINDINGS["Desktop %d" % _n] = ["Meta+%d" % _n]
    BINDINGS["Window to Desktop %d" % _n] = ["Meta+Shift+%d" % _n]

KRUNNER = ["org.kde.krunner.desktop", "_launch", "KRunner", "KRunner"]
KRUNNER_KEY = "Meta+Space"


# ------------------------------------------------------------------ keys ---

def key_code(seq):
    """'Meta+Shift+Left' -> Qt key code with modifiers."""
    code = 0
    *mods, key = seq.split("+")
    for m in mods:
        code |= {"Meta": META, "Shift": SHIFT, "Ctrl": CTRL, "Alt": ALT}[m]
    if key in SPECIAL:
        return code | SPECIAL[key]
    if len(key) == 1:
        return code | ord(key.upper())
    raise ValueError("unknown key " + seq)


def shifted_digits():
    """Map '1'..'9' to the Qt key that Shift+digit types in the user's layout.

    On Wayland KWin reports Meta+Shift+1 as Meta+! on a US keyboard (Shift
    is consumed), so FlexTile binds both. Uses the first layout in kxkbrc.
    """
    layout = run(["kreadconfig6", "--file", "kxkbrc", "--group", "Layout",
                  "--key", "LayoutList"]).split(",")[0].strip() or "us"
    variant = run(["kreadconfig6", "--file", "kxkbrc", "--group", "Layout",
                   "--key", "VariantList"]).split(",")[0].strip()
    lib = ctypes.util.find_library("xkbcommon")
    if not lib:
        return {}
    xkb = ctypes.CDLL(lib)

    class RuleNames(ctypes.Structure):
        _fields_ = [(f, ctypes.c_char_p) for f in ("rules", "model", "layout", "variant", "options")]

    xkb.xkb_context_new.restype = ctypes.c_void_p
    xkb.xkb_keymap_new_from_names.restype = ctypes.c_void_p
    xkb.xkb_keymap_new_from_names.argtypes = [ctypes.c_void_p, ctypes.POINTER(RuleNames), ctypes.c_int]
    xkb.xkb_keymap_key_get_syms_by_level.argtypes = [
        ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32,
        ctypes.POINTER(ctypes.POINTER(ctypes.c_uint32))]
    xkb.xkb_keysym_to_utf32.restype = ctypes.c_uint32

    ctx = xkb.xkb_context_new(0)
    names = RuleNames(None, None, layout.encode(), variant.encode() or None, None)
    keymap = xkb.xkb_keymap_new_from_names(ctx, ctypes.byref(names), 0)
    if not keymap:
        return {}
    out = {}
    for n in range(1, 10):
        syms = ctypes.POINTER(ctypes.c_uint32)()
        # evdev KEY_1 is 2; xkb keycodes are evdev + 8. Level 1 = Shift.
        if xkb.xkb_keymap_key_get_syms_by_level(keymap, n + 1 + 8, 0, 1, ctypes.byref(syms)) > 0:
            cp = xkb.xkb_keysym_to_utf32(syms[0])
            if cp and chr(cp) != str(n):
                out[str(n)] = ord(chr(cp).upper())
    return out


def codes_for(seqs, shifted):
    codes = []
    for s in seqs:
        codes.append(key_code(s))
        m = re.fullmatch(r"Meta\+Shift\+(\d)", s)
        if m and m.group(1) in shifted:
            codes.append(META | shifted[m.group(1)])
    return codes


# ----------------------------------------------------------------- d-bus ---

def run(cmd, check=False):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if check and p.returncode != 0:
        sys.exit("error: %s\n%s" % (" ".join(cmd), p.stderr.strip()))
    return p.stdout.strip()


def gvariant(text):
    # Drop type annotations such as "@a(ai) " that Python cannot read.
    return ast.literal_eval(re.sub(r"@[a-z(){}]+ ", "", text))


def accel(method, *args):
    out = run(["gdbus", "call", "--session", "--dest", "org.kde.kglobalaccel",
               "--object-path", "/kglobalaccel", "--method",
               "org.kde.KGlobalAccel." + method, *args])
    result = gvariant(out) if out else ()
    return result[0] if result else None


def strlist(items):
    return "[" + ", ".join(json.dumps(i) for i in items) + "]"


def keylist(seqs):
    """a(ai) as GVariant text from a list of key-code lists."""
    if not seqs:
        return "@a(ai) []"
    return "[" + ", ".join("([%s],)" % ", ".join(str(k) for k in s) for s in seqs) + "]"


def get_keys(action_id):
    keys = accel("shortcutKeys", strlist(action_id)) or []
    return [list(seq[0]) for seq in keys]


def set_keys(action_id, seqs):
    accel("setForeignShortcutKeys", strlist(action_id), keylist(seqs))


def holders(code):
    found = accel("globalShortcutsByKey", "([%d],)" % code, "(0,)") or []
    return [[f[2], f[0], f[3], f[1]] for f in found]   # comp, action, comp name, action name


def flextile_id(name):
    return ["kwin", "FlexTile: " + name, "KWin", "FlexTile: " + name]


# ---------------------------------------------------------------- backup ---

def load_backup():
    try:
        return json.loads(BACKUP.read_text())
    except (OSError, ValueError):
        return {"shortcuts": {}, "krunner": None}


def save_backup(b):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP.write_text(json.dumps(b, indent=2, ensure_ascii=False))


def free_key(code, backup):
    for action_id in holders(code):
        if action_id[1].startswith("FlexTile: "):
            continue
        tag = action_id[0] + "|" + action_id[1]
        current = get_keys(action_id)
        backup["shortcuts"].setdefault(tag, {"id": action_id, "keys": current})
        save_backup(backup)   # before touching anything, so a crash cannot lose keys
        set_keys(action_id, [s for s in current if s[0] != code])
        print("  %s → released from \"%s\"" % (describe(code), action_id[3]))


def describe(code):
    names = [n for n, m in (("Meta", META), ("Ctrl", CTRL), ("Alt", ALT), ("Shift", SHIFT)) if code & m]
    k = code & 0x01FFFFFF
    key = next((n for n, v in SPECIAL.items() if v == k), chr(k) if k < 0x110000 else hex(k))
    return "+".join(names + [key])


# ----------------------------------------------------------------- kwin ---

def kwin_script(method, *args):
    return run(["gdbus", "call", "--session", "--dest", "org.kde.KWin",
                "--object-path", "/Scripting", "--method",
                "org.kde.kwin.Scripting." + method, *args])


def loaded():
    return "true" in kwin_script("isScriptLoaded", PLUGIN)


def enable_script():
    run(["kwriteconfig6", "--file", "kwinrc", "--group", "Plugins",
         "--key", PLUGIN + "Enabled", "true"], check=True)
    run(["gdbus", "call", "--session", "--dest", "org.kde.KWin", "--object-path",
         "/KWin", "--method", "org.kde.KWin.reconfigure"])
    for _ in range(20):
        if loaded():
            return
        time.sleep(0.25)
    # Some sessions only pick up a newly installed script after re-login.
    main = DATA_HOME / "kwin/scripts" / PLUGIN / "contents/code/main.js"
    kwin_script("loadScript", str(main), PLUGIN)
    kwin_script("start")


def wait_for_actions():
    for _ in range(40):
        names = accel("allActionsForComponent", '["kwin"]') or []
        if any(a[1] == "FlexTile: Toggle Tiling" for a in names):
            return True
        time.sleep(0.25)
    return False


# --------------------------------------------------------------- install ---

def install(args):
    for tool in ("kpackagetool6", "kwriteconfig6", "kreadconfig6", "gdbus"):
        if not run(["sh", "-c", "command -v " + tool]):
            sys.exit("error: %s not found (FlexTile needs Plasma 6)" % tool)

    print("Installing the KWin script…")
    if run(["kpackagetool6", "--type", "KWin/Script", "--show", PLUGIN]):
        run(["kpackagetool6", "--type", "KWin/Script", "--upgrade", str(PACKAGE)], check=True)
    else:
        run(["kpackagetool6", "--type", "KWin/Script", "--install", str(PACKAGE)], check=True)

    backup = load_backup()
    shifted = shifted_digits()
    wanted = {name: codes_for(seqs, shifted) for name, seqs in BINDINGS.items()}

    print("Freeing the keys FlexTile uses…")
    for codes in wanted.values():
        for c in codes:
            free_key(c, backup)
    save_backup(backup)

    print("Starting FlexTile…")
    if loaded():
        kwin_script("unloadScript", PLUGIN)   # so an upgraded main.js is the one running
    enable_script()
    if not wait_for_actions():
        sys.exit("error: FlexTile did not start. Log out and back in, then run this again.")
    for name, codes in wanted.items():
        set_keys(flextile_id(name), [[c, 0, 0, 0] for c in codes])

    if not args.no_launcher:
        print("Meta+Space → KRunner, centred like Spotlight…")
        code = key_code(KRUNNER_KEY)
        free_key(code, backup)
        keys = get_keys(KRUNNER)
        backup["shortcuts"].setdefault("krunner|_launch", {"id": KRUNNER, "keys": keys})
        save_backup(backup)
        if all(s[0] != code for s in keys):
            set_keys(KRUNNER, keys + [[code, 0, 0, 0]])
        if backup.get("krunner") is None:
            backup["krunner"] = run(["kreadconfig6", "--file", "krunnerrc", "--group",
                                     "General", "--key", "FreeFloating"]) or "unset"
        run(["kwriteconfig6", "--file", "krunnerrc", "--group", "General",
             "--key", "FreeFloating", "true"])
        save_backup(backup)

    print("\nDone. Meta+Y turns tiling on and off on the current desktop.")
    print("Your previous shortcuts are saved in %s; ./uninstall.sh puts them back." % BACKUP)


def uninstall(_args):
    backup = load_backup()

    print("Stopping FlexTile…")
    for name in BINDINGS:
        set_keys(flextile_id(name), [])
        accel("unRegister", strlist(flextile_id(name)))
    run(["kwriteconfig6", "--file", "kwinrc", "--group", "Plugins",
         "--key", PLUGIN + "Enabled", "false"])
    kwin_script("unloadScript", PLUGIN)
    run(["gdbus", "call", "--session", "--dest", "org.kde.KWin", "--object-path",
         "/KWin", "--method", "org.kde.KWin.reconfigure"])

    print("Restoring your previous shortcuts…")
    for entry in backup["shortcuts"].values():
        set_keys(entry["id"], entry["keys"])
        print("  \"%s\" restored" % entry["id"][3])

    kr = backup.get("krunner")
    if kr is not None:
        cmd = ["kwriteconfig6", "--file", "krunnerrc", "--group", "General", "--key", "FreeFloating"]
        run(cmd + (["--delete"] if kr == "unset" else [kr]))

    run(["kpackagetool6", "--type", "KWin/Script", "--remove", PLUGIN])
    BACKUP.unlink(missing_ok=True)
    print("\nFlexTile removed.")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("install", help="install or update FlexTile")
    i.add_argument("--no-launcher", action="store_true",
                   help="leave KRunner as it is (no Meta+Space, not centred)")
    sub.add_parser("uninstall", help="remove FlexTile and restore your shortcuts")
    args = ap.parse_args()
    {"install": install, "uninstall": uninstall}[args.cmd](args)


if __name__ == "__main__":
    main()

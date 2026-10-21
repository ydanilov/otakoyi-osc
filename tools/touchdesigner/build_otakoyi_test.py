# Otakoyi Control - TouchDesigner OSC test patch.
# Builds /project1/otakoyi: OSC in on UDP 7000, feedback out to 127.0.0.1:9000,
# a value table, a live preview (brightness/hue/tint/mode) and simulated FPS + audio level.
# Also plays the installation side of the bridge's system OSC (ADR-016):
#   /otakoyi/flash (brief white), /otakoyi/blackout 0|1, /otakoyi/idle 0|1 (dimmed),
#   /otakoyi/pause 0|1 (frozen), /otakoyi/restart (logged; the supervisor does the real restart),
#   /sys/ping -> /sys/pong, and OTAKOYI_PERFORM=1 -> perform mode on start.
# Run from the Textport:  exec(open('<repo>/tools/touchdesigner/build_otakoyi_test.py').read())

import os
# Folder of this script (set HERE before exec if you run it from elsewhere).
HERE = globals().get('HERE') or os.path.dirname(os.path.abspath(globals().get('__file__', '/Users/demo/td-mcp-server/otakoyi/x')))

IN_PORT = 7000
FB_HOST = '127.0.0.1'
FB_PORT = 9000

root = op('/project1')
old = root.op('otakoyi')
if old:
    old.destroy()
base = root.create(baseCOMP, 'otakoyi')
base.nodeX, base.nodeY = 0, -400
base.comment = 'Otakoyi Control test target: OSC in %d, feedback %s:%d' % (IN_PORT, FB_HOST, FB_PORT)

values = base.create(tableDAT, 'values')
values.clear()
values.appendRow(['address', 'value'])
values.nodeX, values.nodeY = 200, 0

# Installation state set by the bridge's system OSC (never echoed, never shown as values).
system = base.create(tableDAT, 'system')
system.clear()
system.appendRows([['key', 'value'], ['blackout', '0'], ['idle', '0'], ['pause', '0'], ['flash_until', '0']])
system.nodeX, system.nodeY = 200, 150

out = base.create(oscoutDAT, 'feedback')
out.par.address = FB_HOST
out.par.port = FB_PORT
out.nodeX, out.nodeY = 200, -150

cb = base.create(textDAT, 'osc_callbacks')
cb.nodeX, cb.nodeY = -200, -150
cb.text = '''
import time

FLASH_S = 0.15

def _flag(args):
    try:
        return '1' if float(args[0]) >= 1 else '0'
    except Exception:
        return '0'

def onReceiveOSC(dat, rowIndex, message, byteData, timeStamp, address, args, peer):
    sysdat = parent().op('system')
    fb = parent().op('feedback')
    if address == '/sys/ping':
        # Heartbeat from the bridge: answer, so it shows the installation as online.
        fb.sendOSC('/sys/pong', [])
        return
    if address == '/otakoyi/flash':
        sysdat['flash_until', 1] = time.time() + FLASH_S
        return
    if address in ('/otakoyi/blackout', '/otakoyi/idle', '/otakoyi/pause'):
        sysdat[address.split('/')[-1], 1] = _flag(args)
        return
    if address == '/otakoyi/restart':
        # In production Otakoyi Runtime's supervisor restarts the process; here we only log it.
        debug('otakoyi: restart requested by the bridge')
        return
    if address.startswith('/otakoyi/'):
        # Pairing mode (/otakoyi/pair ...): never echoed, never shown as values.
        parent().op('otakoyi_pairing/logic').module.handle(address, args)
        return
    v = parent().op('values')
    shown = ' '.join(str(a) for a in args)
    if v.row(address) is None:
        v.appendRow([address, shown])
    else:
        v[address, 1] = shown
    # Echo back as feedback, so every pult shows the installation's real state.
    parent().op('feedback').sendOSC(address, list(args))
    return
'''

oin = base.create(oscinDAT, 'osc_in')
oin.par.port = IN_PORT
oin.par.callbacks = cb
oin.nodeX, oin.nodeY = -200, 0

# Simulated telemetry: audio level 10x a second, FPS once a second.
# Runs on its own timer (run() with delayRef=TDResources), so it works with the timeline paused.
tel = base.create(textDAT, 'telemetry')
tel.nodeX, tel.nodeY = 0, -300
tel.text = '''
import math
def tick(gen):
    b = op('/project1/otakoyi')
    if b is None or b.fetch('gen', None) != gen:
        return  # the patch was rebuilt; this loop retires
    fb = b.op('feedback')
    import time
    t = time.time()
    lvl = 0.35 + 0.3 * abs(math.sin(t * 1.4)) + 0.35 * max(0.0, math.sin(t * 3.2)) ** 8
    fb.sendOSC('/wall/audio/level', [min(1.0, lvl)])
    n = b.fetch('ticks', 0) + 1
    b.store('ticks', n)
    if n % 10 == 0:
        # Real frame rate: TD frames counted over the last second (works with the timeline paused).
        f0, t0 = b.fetch('fps_mark', (absTime.frame, t - 1.0))
        b.store('fps_mark', (absTime.frame, t))
        fb.sendOSC('/sys/fps', [round((absTime.frame - f0) / max(1e-3, t - t0), 1)])
    run("op('/project1/otakoyi/telemetry').module.tick(args[0])", gen,
        delayMilliSeconds=100, delayRef=op.TDResources)

def start():
    import random
    gen = random.random()
    op('/project1/otakoyi').store('gen', gen)
    tick(gen)
'''
boot = base.create(executeDAT, 'on_start')
boot.nodeX, boot.nodeY = 0, -450
boot.text = (
    "import os\n"
    "def onStart():\n"
    "    op('/project1/otakoyi/telemetry').module.start()\n"
    "    # Started by Otakoyi Runtime's supervisor with OTAKOYI_PERFORM=1: no editor.\n"
    "    if os.environ.get('OTAKOYI_PERFORM') == '1':\n"
    "        ui.performMode = True\n"
    "    return\n"
)
boot.par.start = True
tel.module.start()

# Live preview: colour from hue + tint, brightness from intensity, logo text, mode label.
prev = base.create(scriptTOP, 'preview')
prev.par.outputresolution = 'custom'
prev.par.resolutionw, prev.par.resolutionh = 640, 360
prev.nodeX, prev.nodeY = 400, 0
pcb = prev.par.callbacks.eval()
pcb.text = '''
import numpy, colorsys, time
def _num(v, addr, d):
    try:
        return float(str(v[addr, 1]).split()[0])
    except Exception:
        return d
def onCook(scriptOp):
    absTime.frame  # cook every frame (flash timing, pause)
    v = parent().op('values')
    s = parent().op('system')
    if _num(s, 'pause', 0) >= 1 and scriptOp.fetch('last', None) is not None:
        scriptOp.copyNumpyArray(scriptOp.fetch('last'))  # paused: hold the last frame
        return
    img = numpy.zeros((360, 640, 4), dtype=numpy.float32)
    img[:, :, 3] = 1
    if time.time() < _num(s, 'flash_until', 0):
        img[:, :, 0:3] = 1.0  # flash: brief white
    elif _num(s, 'blackout', 0) < 1 and _num(v, '/wall/blackout', 0) < 1:
        b = _num(v, '/wall/intensity', 0.6)
        if _num(s, 'idle', 0) >= 1:
            b *= 0.25  # idle: not reacting to people, dimmed
        h = (_num(v, '/wall/hue', 0) % 360) / 360.0
        r, g, bl = colorsys.hsv_to_rgb(0.22 + h, 0.75, 1.0)
        img[:, :, 0] = r * b
        img[:, :, 1] = g * b
        img[:, :, 2] = bl * b
    scriptOp.store('last', img)
    scriptOp.copyNumpyArray(img)
    return
def onSetupParameters(scriptOp):
    return
'''
prev.cook(force=True)

label = base.create(textTOP, 'label')
label.nodeX, label.nodeY = 400, -150
label.par.resolutionw, label.par.resolutionh = 640, 360
label.par.fontsizex = 18
label.par.alignx = 'left'
label.par.aligny = 'top'
label.par.text.expr = (
    "' '.join(k.upper() for k in ('blackout', 'idle', 'pause') if op('system')[k, 1] == '1') + '\\n' + "
    "'\\n'.join('%s  %s' % (r[0].val, r[1].val) for r in op('values').rows()[1:])"
)

comp = base.create(overTOP, 'show')
comp.inputConnectors[0].connect(label)
comp.inputConnectors[1].connect(prev)
comp.nodeX, comp.nodeY = 650, -50

# Pairing overlay (QR + PIN while the bridge is in pairing mode; Ctrl+Shift+P toggles it).
exec(open(os.path.join(HERE, 'build_otakoyi_pairing.py'), encoding='utf-8').read(), globals())
pair = build_pairing(base)
pair.nodeX, pair.nodeY = 650, -250
final = base.create(overTOP, 'out')
final.inputConnectors[0].connect(pair.outputConnectors[0])
final.inputConnectors[1].connect(comp)
final.nodeX, final.nodeY = 850, -50
final.viewer = True
base.viewer = True
print('OTAKOYI TEST READY: OSC in', IN_PORT, '-> feedback', FB_HOST, FB_PORT)

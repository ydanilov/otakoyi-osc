# Otakoyi pairing overlay for TouchDesigner (ADR 012).
#
# A reusable component the studio drops into any installation project:
#   - shows the pairing QR (+ PIN and web pult address) on the installation's own output,
#     only while the bridge says "pairing mode" (/otakoyi/pair), with a countdown;
#   - Ctrl+Shift+P (or F12) on the installation machine asks the bridge to start/stop pairing mode.
#     In TouchDesigner's editor letter keys may be taken by the network editor: use Perform mode or F12.
#
# Wiring in a project:
#   1. Forward system OSC from your OSC In callback:
#        if address.startswith('/otakoyi/'):
#            op('otakoyi_pairing/logic').module.handle(address, args)
#            return   # never echo /otakoyi/* back
#   2. Wire the otakoyi_pairing COMP's output (outputConnectors[0]) over your final output, e.g. an Over TOP with it
#      as its first input (the overlay is fully transparent while hidden).
#
# Build:  exec(open('<repo>/tools/touchdesigner/build_otakoyi_pairing.py').read()); build_pairing(op('/project1'))

BRIDGE_HTTP = 'http://127.0.0.1:8080'
BRIDGE_FEEDBACK = ('127.0.0.1', 9000)
W, H = 1280, 720

def build_pairing(parent, name='otakoyi_pairing'):
    old = parent.op(name)
    if old:
        old.destroy()
    c = parent.create(baseCOMP, name)
    c.comment = 'Otakoyi pairing overlay: QR + PIN while the bridge is in pairing mode. Ctrl+Shift+P toggles it.'

    state = c.create(tableDAT, 'state')
    state.clear()
    for k, v in (('show', '0'), ('left', '0'), ('app', ''), ('web', ''), ('pin', '')):
        state.appendRow([k, v])

    # Logic as a module: handle() is called by the project's OSC In callback.
    logic = c.create(textDAT, 'logic')
    logic.text = '''
def handle(address, args):
    if address != '/otakoyi/pair':
        return
    s = parent().op('state')
    vals = list(args) + [0, 0, '', '', '']
    was = s['show', 1].val
    s['show', 1] = int(vals[0])
    s['left', 1] = int(vals[1])
    s['app', 1] = vals[2]
    s['web', 1] = vals[3]
    s['pin', 1] = vals[4]
    if s['show', 1].val == '1' and was != '1':
        parent().op('qr').par.reloadpulse.pulse()

def request():
    parent().op('to_bridge').sendOSC('/otakoyi/pair/request', [1])
'''

    out = c.create(oscoutDAT, 'to_bridge')
    out.par.address, out.par.port = BRIDGE_FEEDBACK

    kb = c.create(keyboardinDAT, 'shortcut')
    kbcb = c.create(textDAT, 'shortcut_callbacks')
    kbcb.text = '''
def onKey(dat, key, character, alt, lAlt, rAlt, ctrl, lCtrl, rCtrl, shift, lShift, rShift, state, time, *rest):
    # Ctrl+Shift+P on the installation machine toggles pairing mode on the bridge. TD reports the
    # character of the active layout, so the P key is also Cyrillic ze/pe (Ukrainian/Russian layouts).
    # F12 works too (in Perform mode; the editor binds F12 to a macro).
    k = str(key).lower()
    if state and ((ctrl and shift and k in ('p', '\\u0437', '\\u043f')) or k == 'f12'):
        parent().op('logic').module.request()
    return
'''
    kb.par.callbacks = kbcb

    # The bridge renders the whole card (dark frame, QR on the left) at the output size, so there
    # is no scaling here; only the text is drawn by TouchDesigner on top.
    qr = c.create(moviefileinTOP, 'qr')
    qr.par.file = BRIDGE_HTTP + '/pair.png?card=1&w=%d&h=%d' % (W, H)

    info = c.create(textTOP, 'info')
    info.par.outputresolution = 'custom'
    info.par.resolutionw, info.par.resolutionh = W, H
    info.par.outputaspect = 'resolution'
    info.par.alignx, info.par.aligny = 'left', 'center'
    info.par.positionx = int(W * 0.55)
    info.par.fontsizex = 28
    info.par.bgalpha = 0
    info.par.text.expr = ("'Scan to control\\n\\nPIN  ' + op('state')['pin', 1].val + '\\n\\n' + "
                          "op('state')['web', 1].val + '\\n\\nCloses in ' + op('state')['left', 1].val + ' s'")

    card = c.create(overTOP, 'card')
    card.inputConnectors[0].connect(info)
    card.inputConnectors[1].connect(qr)

    # Fully transparent when not pairing, so it can always sit over the project's output.
    lvl = c.create(levelTOP, 'visibility')
    lvl.inputConnectors[0].connect(card)
    lvl.par.opacity.expr = "1 if op('state')['show', 1].val == '1' else 0"

    # Out TOP = the component's output connector: wire the COMP itself into the project's composite.
    o = c.create(outTOP, 'out')
    o.inputConnectors[0].connect(lvl)

    for i, n in enumerate([state, logic, out, kb, kbcb, qr, info, card, lvl, o]):
        n.nodeX, n.nodeY = (i % 5) * 200, -(i // 5) * 160
    return c

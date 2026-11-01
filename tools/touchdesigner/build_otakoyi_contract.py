# Otakoyi contract component for TouchDesigner: contract generator + generic receiver.
#
# Drop it next to an installation's top-level COMP, point `Target` at that COMP, press Generate:
#   - Generate writes otakoyi/osc-contract.json (relative to project.folder) from the tagged Custom
#     Parameters (core: otakoyi_contract_core.py; tags: otakoyi-td-template docs/standards.md s.4);
#   - OSC In on `Inport` (7000): each contract address sets its parameter (pulse for triggers);
#   - every change of a contract parameter (from the pult or from TD) is echoed to the bridge on
#     `Feedbackport` (9000); /sys/fps once a second;
#   - /otakoyi/pair goes to the pairing overlay (`Pairing`), /otakoyi/flash and /otakoyi/blackout
#     drive this COMP's overlay output, /otakoyi/idle and /otakoyi/pause set the target's Idle /
#     Pause toggles and /otakoyi/restart pulses its Restart, when those parameters exist (the
#     contract's `actions` list exactly what exists). /otakoyi/* is never echoed.
# Wiring: composite this COMP's output (outputConnectors[0], transparent unless flash / blackout)
# over the final output, under the pairing overlay.
#
# Build (Textport):
#   HERE = project.folder + '/<path to otakoyi-osc>/tools/touchdesigner'   # optional
#   exec(open(HERE + '/build_otakoyi_contract.py').read()); build_contract_comp(op('/project1'), op('/project1/show'))
# The core module's text is embedded in the COMP, so the saved .tox has no file references.

import os

HERE = globals().get('HERE') or os.path.dirname(os.path.abspath(globals().get('__file__', 'x')))

LOGIC = r'''
import json, os, time

# Module memory, never COMP storage (td-template standards s.3): rebuilt on demand.
_bindings = {}
_by_par = {}
_fps = {'frame': None, 't': 0.0}

def core():
    return parent().op('core').module

def target():
    return parent().par.Target.eval()

def describe():
    """Custom Parameters of the target, in page order, as plain dicts for the core."""
    t = target()
    out, actions = [], []
    if t is None:
        return out, actions
    for page in t.customPages:
        order = 0
        for tup in page.parTuplets:
            p = tup[0]
            name = p.tupletName if len(tup) > 1 else p.name
            if name in ('Idle', 'Pause', 'Restart'):
                actions.append(name)
            order += 1
            d = {
                'name': name, 'label': p.label, 'page': page.name, 'style': p.style,
                'help': p.help, 'normMin': p.normMin, 'normMax': p.normMax,
                'default': p.default if len(tup) == 1 else None,
                'pars': [q.name for q in tup], 'order': order,
            }
            if p.isMenu:
                d['menuNames'], d['menuLabels'] = list(p.menuNames), list(p.menuLabels)
            out.append(d)
    return out, actions

def meta():
    c = parent().par
    return {
        'id': c.Installid.eval(), 'name': c.Installname.eval(), 'useCase': c.Usecase.eval(),
        'software': {'app': 'touchdesigner', 'version': app.version + '.' + app.build,
                     'project': project.name, 'os': 'macos' if app.osName.lower().startswith('mac') else 'windows'},
        'inPort': c.Inport.eval(), 'feedbackPort': c.Feedbackport.eval(),
        'pairingOverlay': c.Pairing.eval() is not None,
    }

def build():
    pars, actions = describe()
    contract, bindings, warnings = core().build_contract(meta(), pars, actions)
    _bindings.clear(); _bindings.update(bindings)
    _by_par.clear()
    for b in bindings.values():
        for n in b['pars']:
            _by_par[n] = b
    return contract, warnings

def generate():
    contract, warnings = build()
    rel = parent().par.Contractfile.eval() or 'otakoyi/osc-contract.json'
    path = os.path.join(project.folder, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(contract, f, indent=2, ensure_ascii=False)
        f.write('\n')
    rep = parent().op('report')
    rep.clear()
    rep.appendRow(['warning'])
    for w in warnings:
        rep.appendRow([w])
    print('otakoyi contract: %d parameters -> %s (%d warnings)' % (len(contract['parameters']), rel, len(warnings)))
    return path

def binding(address):
    if not _bindings:
        build()
    return _bindings.get(address)

# --- OSC in ------------------------------------------------------------------------------------

def receive(address, args):
    if not parent().par.Active.eval():
        return
    if address.startswith('/otakoyi/'):
        return system(address, args)
    if address == '/sys/ping':
        return send('/sys/pong', [])
    b = binding(address)
    t = target()
    if b is None or t is None:
        return
    for op_, value in core().apply_osc(b, list(args)):
        pars = [getattr(t.par, n, None) for n in b['pars']]
        if any(p is None for p in pars):
            return
        if op_ == 'pulse':
            pars[0].pulse()
        elif isinstance(value, tuple):
            for p, v in zip(pars, value):
                p.val = v
        else:
            pars[0].val = value

# --- feedback ----------------------------------------------------------------------------------

def send(address, args):
    parent().op('feedback').sendOSC(address, args)

def echo(par):
    """Parameter Execute: a contract parameter changed (pult or TD): report its value."""
    if not parent().par.Active.eval():
        return
    if not _by_par:
        build()
    b = _by_par.get(par.name)
    if b is None:
        return
    t = target()
    vals = [getattr(t.par, n).eval() for n in b['pars']]
    args = core().echo_args(b, tuple(vals) if len(vals) > 1 else vals[0])
    if args is not None:
        send(b['address'], args)

def frame():
    """Execute DAT, every frame: /sys/fps once a second, flash timing."""
    now = time.time()
    if _fps['frame'] is None:
        _fps.update(frame=absTime.frame, t=now)
    elif now - _fps['t'] >= 1.0:
        fps = (absTime.frame - _fps['frame']) / max(1e-3, now - _fps['t'])
        _fps.update(frame=absTime.frame, t=now)
        if parent().par.Active.eval():
            send('/sys/fps', [round(fps, 1)])
    s = parent().op('system')
    flashing = '1' if now < float(s['flash_until', 1].val or 0) else '0'
    if s['flashing', 1].val != flashing:
        s['flashing', 1] = flashing

# --- system messages from the bridge (never echoed) --------------------------------------------

def _flag(args):
    try:
        return 1 if float(args[0]) >= 1 else 0
    except Exception:
        return 0

def system(address, args):
    s = parent().op('system')
    t = target()
    if address == '/otakoyi/pair':
        pair = parent().par.Pairing.eval()
        if pair is not None:
            pair.op('logic').module.handle(address, args)
    elif address == '/otakoyi/flash':
        s['flash_until', 1] = time.time() + 0.15
    elif address == '/otakoyi/blackout':
        s['blackout', 1] = _flag(args)
    elif address in ('/otakoyi/idle', '/otakoyi/pause'):
        key = address.split('/')[-1]
        s[key, 1] = _flag(args)
        p = getattr(t.par, key.capitalize(), None) if t is not None else None
        if p is not None:
            p.val = _flag(args)
    elif address == '/otakoyi/restart':
        p = getattr(t.par, 'Restart', None) if t is not None else None
        if p is not None:
            p.pulse()
        else:
            debug('otakoyi: restart requested; the target has no Restart pulse')
'''


def build_contract_comp(parent, target=None, name='otakoyi_contract', pairing=None):
    old = parent.op(name)
    if old:
        old.destroy()
    c = parent.create(baseCOMP, name)
    c.comment = 'Otakoyi contract: Generate writes otakoyi/osc-contract.json; OSC in 7000 -> parameters, echo to 9000'

    pg = c.appendCustomPage('Otakoyi')
    pg.appendCOMP('Target', label='Target COMP')
    pg.appendStr('Installid', label='Installation id')
    pg.appendStr('Installname', label='Installation name')
    um = pg.appendMenu('Usecase', label='Use case')[0]
    um.menuNames = ['lobby', 'live', 'both']
    um.menuLabels = ['Lobby (phone first)', 'Live (tablet first)', 'Both']
    pg.appendInt('Inport', label='OSC in port')[0].default = 7000
    pg.appendStr('Feedbackhost', label='Feedback host')[0].default = '127.0.0.1'
    pg.appendInt('Feedbackport', label='Feedback port')[0].default = 9000
    pg.appendStr('Contractfile', label='Contract file')[0].default = 'otakoyi/osc-contract.json'
    pg.appendCOMP('Pairing', label='Pairing overlay')
    pg.appendToggle('Active', label='Active')[0].default = True
    pg.appendPulse('Generate', label='Generate contract')
    for p in c.customPars:
        if p.name not in ('Target', 'Pairing', 'Installid', 'Installname', 'Generate'):
            p.val = p.default
    slug = ''.join(ch if ch.isalnum() else '-' for ch in project.name.lower()).strip('-') or 'installation'
    c.par.Installid = slug[:64]
    c.par.Installname = project.name
    if target is not None:
        c.par.Target = target
    if pairing is not None:
        c.par.Pairing = pairing

    core = c.create(textDAT, 'core')
    core.text = open(os.path.join(HERE, 'otakoyi_contract_core.py'), encoding='utf-8').read()
    core.nodeX, core.nodeY = -400, 200
    logic = c.create(textDAT, 'logic')
    logic.text = LOGIC
    logic.nodeX, logic.nodeY = -200, 200

    report = c.create(tableDAT, 'report')
    report.clear()
    report.appendRow(['warning'])
    report.nodeX, report.nodeY = 0, 200

    system = c.create(tableDAT, 'system')
    system.clear()
    system.appendRows([['key', 'value'], ['blackout', '0'], ['idle', '0'], ['pause', '0'],
                       ['flash_until', '0'], ['flashing', '0']])
    system.nodeX, system.nodeY = 200, 200

    fb = c.create(oscoutDAT, 'feedback')
    fb.par.address.expr = 'parent().par.Feedbackhost'
    fb.par.port.expr = 'parent().par.Feedbackport'
    fb.nodeX, fb.nodeY = 200, 0

    cb = c.create(textDAT, 'osc_callbacks')
    cb.text = (
        "def onReceiveOSC(dat, rowIndex, message, byteData, timeStamp, address, args, peer):\n"
        "    parent().op('logic').module.receive(address, args)\n"
        "    return\n"
    )
    cb.nodeX, cb.nodeY = -400, 0
    oin = c.create(oscinDAT, 'osc_in')
    oin.par.port.expr = 'parent().par.Inport'
    oin.par.callbacks = cb
    oin.nodeX, oin.nodeY = -200, 0

    pex = c.create(parameterexecuteDAT, 'par_exec')
    pex.par.op.expr = "parent().par.Target.eval() or ''"
    pex.par.custom = True
    pex.par.builtin = False
    pex.par.pars = '*'
    pex.par.valuechange = True
    pex.text = (
        "def onValueChange(par, prev):\n"
        "    parent().op('logic').module.echo(par)\n"
        "    return\n"
    )
    pex.nodeX, pex.nodeY = 0, 0

    gen = c.create(parameterexecuteDAT, 'on_generate')
    gen.par.op = c.path
    gen.par.custom = True
    gen.par.builtin = False
    gen.par.pars = 'Generate'
    gen.par.onpulse = True
    gen.text = (
        "def onPulse(par):\n"
        "    parent().op('logic').module.generate()\n"
        "    return\n"
    )
    gen.nodeX, gen.nodeY = 0, -150

    tick = c.create(executeDAT, 'tick')
    tick.par.framestart = True
    tick.text = (
        "def onFrameStart(frame):\n"
        "    parent().op('logic').module.frame()\n"
        "    return\n"
    )
    tick.nodeX, tick.nodeY = 200, -150

    # Overlay: transparent; white while flashing; black while blackout. Sized from the target's
    # Resw / Resh when it has them (standards s.5), else 1920 x 1080.
    ov = c.create(constantTOP, 'overlay')
    ov.par.outputresolution = 'custom'
    ov.par.resolutionw.expr = "int(getattr(parent().par.Target.eval().par, 'Resw', 1920)) if parent().par.Target.eval() else 1920"
    ov.par.resolutionh.expr = "int(getattr(parent().par.Target.eval().par, 'Resh', 1080)) if parent().par.Target.eval() else 1080"
    for ch in ('colorr', 'colorg', 'colorb'):
        getattr(ov.par, ch).expr = "1 if op('system')['flashing', 1] == '1' else 0"
    ov.par.alpha.expr = "1 if op('system')['flashing', 1] == '1' or op('system')['blackout', 1] == '1' else 0"
    ov.nodeX, ov.nodeY = 400, 0
    out = c.create(outTOP, 'out1')
    out.inputConnectors[0].connect(ov)
    out.nodeX, out.nodeY = 600, 0

    if target is not None:
        logic.module.build()
    print('OTAKOYI CONTRACT READY: point Target at the installation COMP, then pulse Generate')
    return c

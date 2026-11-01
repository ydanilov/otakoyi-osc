# Otakoyi contract core: TouchDesigner Custom Parameters -> OSC contract, and OSC <-> parameter
# values. Pure Python (no `td` imports), so it is tested outside TouchDesigner
# (tools/touchdesigner/test_otakoyi_contract_core.py) and loaded into the otakoyi_contract COMP as
# the `core` module by build_otakoyi_contract.py.
#
# Help tags (syntax: otakoyi-td-template docs/standards.md section 4; keep the two in sync):
#   [live] [tune] [setup] [hide]  -> priority (live / tune / setup / hidden); exactly one
#   [danger]                      -> dangerous: true (hold-to-confirm on the pult)
#   untagged                      -> tune, with a warning
#
# The TD page `System` is the standard System group (ADR-018 in otakoyi-osc): exactly Resw, Resh,
# Debug (legacy name Rehearsal) and Seed, on /system/resw, /system/resh, /system/debug,
# /system/seed. Parameters named Idle, Pause and Restart (any page) are the handlers of the
# bridge's system actions, not contract parameters.

import re

CONTRACT_VERSION = 1.1
PRIORITY = {'live': 'live', 'tune': 'tune', 'setup': 'setup', 'hide': 'hidden'}
TAG_RE = re.compile(r'^\s*((?:\[[a-z]+\]\s*)+)')

SYSTEM_PAGE = 'System'
# TD parameter name -> (address, contract type). Rehearsal is the legacy name of Debug.
SYSTEM_PARS = {
    'Resw': ('/system/resw', 'int'),
    'Resh': ('/system/resh', 'int'),
    'Debug': ('/system/debug', 'bool'),
    'Rehearsal': ('/system/debug', 'bool'),
    'Seed': ('/system/seed', 'int'),
}
SYSTEM_LABELS = {
    '/system/resw': 'Screen Width px',
    '/system/resh': 'Screen Height px',
    '/system/debug': 'Debug',
    '/system/seed': 'Seed',
}
# Parameters that implement /otakoyi/<action> instead of being parameters.
ACTION_PARS = {'Idle': 'idle', 'Pause': 'pause', 'Restart': 'restart'}

# TD parameter style -> contract type. Tuples (RGB, XY) are one parameter on one address.
STYLE_TYPE = {
    'Float': 'float',
    'Int': 'int',
    'Toggle': 'bool',
    'Momentary': 'bool',
    'Pulse': 'trigger',
    'Menu': 'enum',
    'StrMenu': 'enum',
    'RGB': 'color',
    'RGBA': 'color',
    'XY': 'xy',
    'UV': 'xy',
    'Str': 'string',
}


def parse_tags(help_text):
    """'[live][danger] Restart...' -> (['live', 'danger'], 'Restart...')."""
    text = help_text or ''
    m = TAG_RE.match(text)
    if not m:
        return [], text.strip()
    return re.findall(r'\[([a-z]+)\]', m.group(1)), text[m.end():].strip()


def slug(s):
    """Address segment: lowercase, spaces and symbols to '_' (no # * , ? [ ] { } or spaces)."""
    s = re.sub(r'[^a-z0-9_\-.]+', '_', (s or '').strip().lower()).strip('_')
    return s or 'x'


def address_for(page, name):
    """/<group-lowercase>/<param-lowercase> (docs/integration.md step 1)."""
    return '/%s/%s' % (slug(page), slug(name))


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(f) if f == int(f) else f


def param_entry(p, warnings):
    """
    One contract parameter from a parameter description `p` (a dict, filled by the TD side):
      name, label, page, style, help, normMin, normMax, default, menuNames, menuLabels, order.
    Returns (entry, binding) or (None, None) when the parameter is not in the contract. `binding`
    tells the receiver how to apply OSC to TouchDesigner: {'address', 'type', 'name', 'style'}.
    """
    name, page, style = p['name'], p.get('page') or 'General', p.get('style')
    if name in ACTION_PARS:
        return None, None
    tags, desc = parse_tags(p.get('help'))
    prios = [PRIORITY[t] for t in tags if t in PRIORITY]
    unknown = [t for t in tags if t not in PRIORITY and t != 'danger']
    if unknown:
        warnings.append('%s: unknown tag %s' % (name, ', '.join('[%s]' % t for t in unknown)))
    if len(prios) > 1:
        warnings.append('%s: several priority tags, using [%s]' % (name, tags[0]))

    if page == SYSTEM_PAGE:
        if name not in SYSTEM_PARS:
            warnings.append('%s: the System page holds only Resw, Resh, Debug and Seed; left out' % name)
            return None, None
        address, ptype = SYSTEM_PARS[name]
        e = {'address': address, 'type': ptype, 'label': SYSTEM_LABELS[address],
             'feedback': True, 'group': SYSTEM_PAGE, 'priority': 'setup'}
        if desc:
            e['description'] = desc
        if ptype == 'int' and address != '/system/seed':
            e.update({'min': 16, 'max': 16384, 'unit': 'px'})
        if ptype == 'int' and address == '/system/seed':
            e['min'] = 0
        d = p.get('default')
        if d is not None:
            e['default'] = bool(d) if ptype == 'bool' else _num(d)
        return e, _binding(address, ptype, p)

    if prios and prios[0] == 'hidden':
        return None, None
    ptype = STYLE_TYPE.get(style)
    if ptype is None:
        warnings.append('%s: style %s has no OSC type; left out' % (name, style))
        return None, None
    if not prios:
        warnings.append('%s: no priority tag, drafted as [tune]' % name)

    address = address_for(page, name)
    e = {'address': address, 'type': ptype, 'label': p.get('label') or name}
    if desc:
        e['description'] = desc
    if ptype in ('float', 'int', 'xy'):
        lo, hi = _num(p.get('normMin')), _num(p.get('normMax'))
        if lo is not None and hi is not None and hi > lo:
            e['min'], e['max'] = lo, hi
    d = p.get('default')
    if ptype in ('float', 'int') and _num(d) is not None:
        e['default'] = _num(d)
    elif ptype == 'bool' and d is not None:
        e['default'] = bool(_num(d))
    elif ptype in ('enum', 'string') and d not in (None, ''):
        e['default'] = str(d)
    if ptype == 'enum':
        names = list(p.get('menuNames') or [])
        labels = list(p.get('menuLabels') or names)
        e['options'] = [{'value': n, 'label': labels[i] if i < len(labels) else n}
                        for i, n in enumerate(names)]
    if ptype == 'color':
        e['colorFormat'] = 'rgbFloat'
    if ptype != 'trigger':
        e['feedback'] = True
    if 'danger' in tags:
        e['dangerous'] = True
    e['group'] = page
    e['priority'] = prios[0] if prios else 'tune'
    if p.get('order') is not None:
        e['order'] = p['order']
    return e, _binding(address, ptype, p)


def _binding(address, ptype, p):
    # `pars`: the TD parameter names behind it (one, or the components of an RGB / XY tuple).
    return {'address': address, 'type': ptype, 'name': p['name'], 'style': p.get('style'),
            'pars': list(p.get('pars') or [p['name']])}


def build_contract(meta, pars, action_pars=()):
    """
    The whole contract. `meta`: installation id / name / useCase, software, ports. `pars`: parameter
    descriptions in page order. `action_pars`: names present among Idle / Pause / Restart.
    Returns (contract, bindings, warnings).
    """
    warnings, params, bindings, seen = [], [], {}, set()
    for p in pars:
        e, b = param_entry(p, warnings)
        if e is None:
            continue
        if e['address'] in seen:
            warnings.append('%s: address %s is taken; left out' % (p['name'], e['address']))
            continue
        seen.add(e['address'])
        params.append(e)
        bindings[e['address']] = b
    system = [e for e in params if e['group'] == SYSTEM_PAGE]
    if system and len(system) != 4:
        missing = sorted(set(SYSTEM_LABELS) - {e['address'] for e in system})
        warnings.append('System page: missing %s (the contract is invalid until it has all four)'
                        % ', '.join(missing))
    if not system:
        warnings.append('no System page: add Resw, Resh, Debug and Seed (td-template standards section 4)')
    actions = ['flash', 'blackout']
    for n in ('Idle', 'Pause', 'Restart'):
        if n in action_pars:
            actions.append(ACTION_PARS[n])
    contract = {
        'contractVersion': CONTRACT_VERSION,
        'installation': {k: v for k, v in (
            ('id', meta['id']), ('name', meta['name']), ('useCase', meta.get('useCase'))) if v},
        'software': {k: v for k, v in meta.get('software', {}).items() if v},
        'osc': {'in': {'protocol': 'udp', 'port': int(meta.get('inPort', 7000))},
                'feedback': {'port': int(meta.get('feedbackPort', 9000)), 'aliveAddress': '/sys/fps'}},
        'parameters': params,
        'telemetry': [{'address': '/sys/fps', 'type': 'float', 'label': 'FPS', 'unit': 'fps', 'rateHz': 1}],
        'actions': actions,
        'pairingOverlay': bool(meta.get('pairingOverlay')),
    }
    if not contract['software']:
        del contract['software']
    return contract, bindings, warnings


def apply_osc(binding, args):
    """
    What to do with an incoming message for a bound parameter: a list of ('set', value) or
    ('pulse', None). Values are in TouchDesigner's terms (tuples for RGB / XY).
    """
    t = binding['type']
    if t == 'trigger':
        return [('pulse', None)] if args and (_num(args[0]) or 0) >= 1 else []
    if not args:
        return []
    if t == 'bool':
        return [('set', 1 if (_num(args[0]) or 0) >= 0.5 else 0)]
    if t == 'int':
        v = _num(args[0])
        return [] if v is None else [('set', int(round(v)))]
    if t == 'float':
        v = _num(args[0])
        return [] if v is None else [('set', float(v))]
    if t in ('enum', 'string'):
        return [('set', str(args[0]))]
    if t in ('color', 'xy'):
        vals = [_num(a) for a in args]
        if any(v is None for v in vals):
            return []
        return [('set', tuple(float(v) for v in vals))]
    return []


def echo_args(binding, value):
    """OSC arguments that report the parameter's current value (feedback on the same address)."""
    t = binding['type']
    if t == 'trigger':
        return None
    if isinstance(value, (tuple, list)):
        return [float(v) for v in value]
    if t == 'bool':
        return [1 if value else 0]
    if t == 'int':
        return [int(value)]
    if t == 'float':
        return [float(value)]
    return [str(value)]

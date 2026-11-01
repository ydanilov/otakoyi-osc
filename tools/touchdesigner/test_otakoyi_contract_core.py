# Tests for otakoyi_contract_core.py (pure Python, no TouchDesigner).
#   python3 -m unittest tools/touchdesigner/test_otakoyi_contract_core.py
# `python3 tools/touchdesigner/test_otakoyi_contract_core.py --fixture` prints the fixture contract
# as JSON; tools/pult-plan/src/td-core.test.ts validates it with the repo's contract parser.
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import otakoyi_contract_core as core  # noqa: E402

PARS = [
    {'name': 'Pumpspeed', 'label': 'Pump Speed', 'page': 'Market', 'style': 'Float',
     'help': '[live] How fast the whale pumps', 'normMin': 0, 'normMax': 2, 'default': 1},
    {'name': 'Scenario', 'label': 'Scenario', 'page': 'Market', 'style': 'Menu',
     'help': '[live][danger] Market scenario', 'default': 'SIDEWAYS',
     'menuNames': ['SIDEWAYS', 'PUMP', 'DUMP'], 'menuLabels': ['Sideways', 'Pump', 'Dump']},
    {'name': 'Firemoon', 'label': 'Fire MOON', 'page': 'Events', 'style': 'Pulse',
     'help': '[tune] Fire the moon event'},
    {'name': 'Framestroke', 'label': 'Frame Stroke HEX', 'page': 'Events', 'style': 'Str',
     'help': '[setup] Frame colour', 'default': '#e2a93b'},
    {'name': 'Upcolor', 'label': 'Up', 'page': 'Look', 'style': 'RGB', 'help': '[tune] Up candles'},
    {'name': 'Whalepresent', 'label': 'Whale Present', 'page': 'Whale', 'style': 'Toggle',
     'help': 'no tag here', 'default': 0},
    {'name': 'Internal', 'label': 'Internal', 'page': 'Whale', 'style': 'Float', 'help': '[hide] x'},
    {'name': 'Resw', 'label': 'Screen Width px', 'page': 'System', 'style': 'Int',
     'help': '[setup] Output width', 'default': 1280},
    {'name': 'Resh', 'label': 'Screen Height px', 'page': 'System', 'style': 'Int',
     'help': '[setup] Output height', 'default': 1280},
    {'name': 'Rehearsal', 'label': 'Rehearsal', 'page': 'System', 'style': 'Toggle',
     'help': '[setup] Debug overlay', 'default': 0},
    {'name': 'Seed', 'label': 'Seed', 'page': 'System', 'style': 'Int', 'help': '[setup] 0 = random'},
    {'name': 'Restart', 'label': 'Restart', 'page': 'System', 'style': 'Pulse', 'help': '[live] Restart'},
]
META = {'id': 'the-whale', 'name': 'The Whale', 'useCase': 'live',
        'software': {'app': 'touchdesigner', 'os': 'macos'}, 'pairingOverlay': True}


def fixture():
    return core.build_contract(META, PARS, action_pars=('Restart',))


class Core(unittest.TestCase):
    def test_tags(self):
        self.assertEqual(core.parse_tags('[live][danger] Go'), (['live', 'danger'], 'Go'))
        self.assertEqual(core.parse_tags('plain'), ([], 'plain'))

    def test_contract(self):
        c, bindings, warnings = fixture()
        by = {p['address']: p for p in c['parameters']}
        self.assertEqual(by['/market/pumpspeed']['priority'], 'live')
        self.assertEqual(by['/market/pumpspeed']['min'], 0)
        self.assertEqual(by['/market/pumpspeed']['max'], 2)
        self.assertTrue(by['/market/scenario']['dangerous'])
        self.assertEqual(by['/market/scenario']['options'][1], {'value': 'PUMP', 'label': 'Pump'})
        self.assertEqual(by['/events/firemoon']['type'], 'trigger')
        self.assertNotIn('feedback', by['/events/firemoon'])
        self.assertEqual(by['/look/upcolor']['colorFormat'], 'rgbFloat')
        self.assertEqual(by['/whale/whalepresent']['priority'], 'tune')
        self.assertNotIn('/whale/internal', by)
        # System page -> the standard System group; Rehearsal is the legacy name of Debug.
        self.assertEqual(by['/system/debug']['group'], 'System')
        self.assertEqual(bindings['/system/debug']['name'], 'Rehearsal')
        self.assertNotIn('/system/restart', by)
        self.assertEqual(c['actions'], ['flash', 'blackout', 'restart'])
        self.assertTrue(any('Whalepresent' in w for w in warnings))

    def test_osc_in_and_echo(self):
        b = {'type': 'trigger'}
        self.assertEqual(core.apply_osc(b, [1]), [('pulse', None)])
        self.assertEqual(core.apply_osc(b, [0]), [])
        self.assertEqual(core.apply_osc({'type': 'int'}, [1279.6]), [('set', 1280)])
        self.assertEqual(core.apply_osc({'type': 'color'}, [1, 0.5, 0]), [('set', (1.0, 0.5, 0.0))])
        self.assertEqual(core.echo_args({'type': 'bool'}, 1), [1])
        self.assertEqual(core.echo_args({'type': 'color'}, (1, 0, 0)), [1.0, 0.0, 0.0])
        self.assertIsNone(core.echo_args({'type': 'trigger'}, 0))


def whale():
    # Real Custom Parameters of ydanilov/the-whale (fixtures/the-whale-pars.json).
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, 'fixtures', 'the-whale-pars.json'), encoding='utf-8') as f:
        data = json.load(f)
    meta = {'id': 'the-whale', 'name': 'The Whale: Illusion of Control', 'useCase': 'live',
            'software': {'app': 'touchdesigner', 'os': 'macos'}}
    return core.build_contract(meta, data['pars'], data['actions'])


if __name__ == '__main__':
    if '--fixture' in sys.argv:
        print(json.dumps(fixture()[0]))
    elif '--whale' in sys.argv:
        print(json.dumps(whale()[0]))
    else:
        unittest.main()

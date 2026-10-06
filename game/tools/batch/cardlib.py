# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Helpers for writing a batch of card definitions (CrankCardScript@1) and their scenarios (CrankCardScenarios@1).

A batch's own generator authors the abilities and scenarios and hands them to `Batch.write`. Each card's identity --
name, oracle id, cost, types, colors, power and toughness -- and its oracle text come from the committed oracle data
(data/engine/oracle.json), never typed by hand. Nothing here writes anything when it is imported.

    import os, sys
    root = sys.argv[1]
    sys.path.insert(0, os.path.join(root, 'game', 'tools', 'batch'))
    from cardlib import Batch, kw, trig, at, later, creature, bare

    b = Batch(root)
    L = b.lines('Skyknight Vanguard')
    CARDS = {'Skyknight Vanguard': [kw('Flying', 'flying'), trig(L[1], {'on': 'attacks'}, [...])]}
    SCEN = {'Skyknight Vanguard': (None, [{'name': '...', 'setup': [at(0, 'battlefield', 'Skyknight Vanguard')],
                                            'steps': [...], 'expect': [...]}])}
    print(b.write(CARDS, SCEN, only=sys.argv[2:]), 'definitions written')

SCEN maps each card to (fixtures or None, [scenario, ...]); every card in CARDS needs scenarios.

A double-faced card (a modal one, or a nonmodal one that transforms; CR 712.2-712.3) is written from its oracle faces:
its identity and oracle text are its front face's, under the whole card's name (`lines` reads the front, `back_lines`
the back), and `write(..., backs={name: [ability, ...]})` gives its back face, with the face's own identity. A nonmodal
one's script says `layout: "transform"`, so the engine knows it transforms (cards/index.mjs).
"""
import json
import os
import re
import unicodedata

SUPERTYPES = {'Legendary', 'Basic', 'Snow', 'World'}
LAND_FOR = {'W': 'Plains', 'U': 'Island', 'B': 'Swamp', 'R': 'Mountain', 'G': 'Forest'}


def slug(name):
    """The file name a definition is written under: game/engine/cards/<first letter>/<slug>.json. Accents folded, as the
    card index folds a name (cards/index.mjs): "Óin the Brave" is oin-the-brave, under o."""
    folded = ''.join(c for c in unicodedata.normalize('NFKD', name) if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', folded.lower().replace("'", '')).strip('-')


def bare(line):
    """An oracle line without its closing reminder text: "Ninjutsu {2}{U}{U} (...)" -> "Ninjutsu {2}{U}{U}"."""
    return re.sub(r'\s*\([^)]*\)\s*$', '', line)


def kw(text, word, **more):
    """A keyword ability: kw('Flying', 'flying'), kw('Crew 4', 'crew', amount=4)."""
    return {'kind': 'keyword', 'text': text, 'keyword': word, **more}


def trig(text, trigger, effects, **more):
    """A triggered ability; `more` carries targets, condition, limit, optional."""
    return {'kind': 'triggered', 'text': text, 'trigger': trigger, 'effects': effects, **more}


def at(seat, zone, *cards):
    """A scenario's setup entry: these cards in that seat's zone before the game starts."""
    return {'seat': seat, 'zone': zone, 'cards': list(cards)}


def later(seat, zone, *cards):
    """The same, put there once the scenario reaches its start (turn 1, main phase) -- after the first upkeep, so an
    upkeep trigger does not fire before the scenario begins."""
    return {**at(seat, zone, *cards), 'sick': True}


def creature(cost, subtypes=(), colors=('G',), p=1, t=1, **more):
    """A scenario fixture: a creature that is not a real card."""
    return {'types': ['Creature'], 'subtypes': list(subtypes), 'manaCost': cost, 'colors': list(colors), 'power': p, 'toughness': t, **more}


class Batch:
    """The oracle data of the repository at `root`, and the writing of a batch's definitions and scenarios into it."""

    def __init__(self, root):
        self.root = root
        with open(os.path.join(root, 'data', 'engine', 'oracle.json'), encoding='utf-8') as f:
            self.oracle = {c['name']: c for c in json.load(f)['cards']}

    def card(self, name):
        if name not in self.oracle:
            raise KeyError(f'{name}: not in data/engine/oracle.json')
        return self.oracle[name]

    DOUBLE = ('modal_dfc', 'transform')

    def faces(self, name):
        """A double-faced card's two faces, front first, or None for any other card."""
        c = self.card(name)
        return c['faces'] if c.get('layout') in self.DOUBLE and c.get('faces') else None

    def front(self, name):
        """What a definition is written from: a double-faced card's front face (CR 712.8a), any other card itself."""
        faces = self.faces(name)
        return faces[0] if faces else self.card(name)

    def lines(self, name):
        """The card's oracle text, a line each (a double-faced card's front face's)."""
        return self.front(name)['text'].split('\n')

    def back_lines(self, name):
        """A double-faced card's back face's oracle text, a line each."""
        return self.faces(name)[1]['text'].split('\n')

    @staticmethod
    def _identity(face, name, oracle_id=None, ci=None):
        left, _, right = face['type'].partition(' — ')
        words = left.split()
        num = lambda v: int(v) if v is not None and re.fullmatch(r'\d+', v) else None
        sup = [w for w in words if w in SUPERTYPES]
        return {
            'name': name, **({'oracleId': oracle_id} if oracle_id else {}), **({'supertypes': sup} if sup else {}), 'types': [w for w in words if w not in SUPERTYPES],
            'subtypes': right.split() if right else [],
            'manaCost': face['mana'] or None, 'colors': face['colors'], **({'colorIdentity': ci} if ci is not None else {}),
            'power': num(face['power']), 'toughness': num(face['toughness']),
            **({'loyalty': num(face['loyalty'])} if face.get('loyalty') else {}),
        }

    def identity(self, name):
        """The definition's identity block, from the oracle data: a double-faced card's front face, under the card's name, its
        color identity both faces' (CR 903.4)."""
        c = self.card(name)
        ident = self._identity(self.front(name), c['name'], c['id'], c['ci'])
        if not self.faces(name):
            ident['manaCost'] = c['mana']
        return ident

    def back(self, name, abilities):
        """A double-faced card's back face (CR 712.8): its own identity (the card's oracle id is the front's), text and abilities."""
        face = self.faces(name)[1]
        return {'identity': self._identity(face, face['name']), 'oracleText': face['text'], 'abilities': abilities}

    def pay(self, name, seat=None):
        """The basic lands (and Wastes for generic mana) that pay the card's mana cost exactly, and the scenario steps
        that tap them -- a scenario pays mana exactly."""
        cost = self.card(name)['mana'] or ''
        lands = [LAND_FOR[s] for s in re.findall(r'\{([WUBRG])\}', cost)] + ['Wastes'] * sum(int(n) for n in re.findall(r'\{(\d+)\}', cost))
        return lands, [{'tap': land, **({'seat': seat} if seat is not None else {})} for land in lands]

    def write(self, cards, scenarios, only=None, backs=None):
        """Write each card's definition and scenarios; `only` limits it to those names; `backs` gives each double-faced
        card's back-face abilities. Returns how many it wrote."""
        if set(cards) != set(scenarios):
            raise ValueError(f'cards and scenarios differ: {sorted(set(cards) ^ set(scenarios))}')
        backs = backs or {}
        written = 0
        for name, abilities in cards.items():
            if only and name not in only:
                continue
            if bool(self.faces(name)) != (name in backs):
                raise ValueError(f'{name}: a double-faced card is written with its back face, and only one is')
            s = slug(name)
            folder = os.path.join(self.root, 'game', 'engine', 'cards', s[0])
            os.makedirs(folder, exist_ok=True)
            script = {'schema': 'CrankCardScript@1', 'identity': self.identity(name), 'oracleText': self.front(name)['text'], 'source': 'hand', 'abilities': abilities}
            if name in backs:
                if self.card(name)['layout'] == 'transform':
                    script['layout'] = 'transform'
                script['back'] = self.back(name, backs[name])
            with open(os.path.join(folder, s + '.json'), 'w', encoding='utf-8', newline='\n') as f:
                f.write(json.dumps(script, indent=2, ensure_ascii=False) + '\n')
            fixtures, runs = scenarios[name]
            doc = {'schema': 'CrankCardScenarios@1', 'card': name, **({'fixtures': fixtures} if fixtures else {}), 'scenarios': runs}
            with open(os.path.join(folder, s + '.scenarios.json'), 'w', encoding='utf-8', newline='\n') as f:
                f.write(json.dumps(doc, indent=2, ensure_ascii=False) + '\n')
            written += 1
        return written

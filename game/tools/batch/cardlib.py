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

    def lines(self, name):
        """The card's oracle text, a line each."""
        return self.card(name)['text'].split('\n')

    def identity(self, name):
        """The definition's identity block, from the oracle data."""
        c = self.card(name)
        left, _, right = c['type'].partition(' — ')
        words = left.split()
        num = lambda v: int(v) if v is not None and re.fullmatch(r'\d+', v) else None
        sup = [w for w in words if w in SUPERTYPES]
        return {
            'name': c['name'], 'oracleId': c['id'], **({'supertypes': sup} if sup else {}), 'types': [w for w in words if w not in SUPERTYPES],
            'subtypes': right.split() if right else [],
            'manaCost': c['mana'], 'colors': c['colors'], 'colorIdentity': c['ci'],
            'power': num(c['power']), 'toughness': num(c['toughness']),
            **({'loyalty': num(c['loyalty'])} if c.get('loyalty') else {}),
        }

    def pay(self, name, seat=None):
        """The basic lands (and Wastes for generic mana) that pay the card's mana cost exactly, and the scenario steps
        that tap them -- a scenario pays mana exactly."""
        cost = self.card(name)['mana'] or ''
        lands = [LAND_FOR[s] for s in re.findall(r'\{([WUBRG])\}', cost)] + ['Wastes'] * sum(int(n) for n in re.findall(r'\{(\d+)\}', cost))
        return lands, [{'tap': land, **({'seat': seat} if seat is not None else {})} for land in lands]

    def write(self, cards, scenarios, only=None):
        """Write each card's definition and scenarios; `only` limits it to those names. Returns how many it wrote."""
        if set(cards) != set(scenarios):
            raise ValueError(f'cards and scenarios differ: {sorted(set(cards) ^ set(scenarios))}')
        written = 0
        for name, abilities in cards.items():
            if only and name not in only:
                continue
            s = slug(name)
            folder = os.path.join(self.root, 'game', 'engine', 'cards', s[0])
            os.makedirs(folder, exist_ok=True)
            script = {'schema': 'CrankCardScript@1', 'identity': self.identity(name), 'oracleText': self.card(name)['text'], 'source': 'hand', 'abilities': abilities}
            with open(os.path.join(folder, s + '.json'), 'w', encoding='utf-8', newline='\n') as f:
                f.write(json.dumps(script, indent=2, ensure_ascii=False) + '\n')
            fixtures, runs = scenarios[name]
            doc = {'schema': 'CrankCardScenarios@1', 'card': name, **({'fixtures': fixtures} if fixtures else {}), 'scenarios': runs}
            with open(os.path.join(folder, s + '.scenarios.json'), 'w', encoding='utf-8', newline='\n') as f:
                f.write(json.dumps(doc, indent=2, ensure_ascii=False) + '\n')
            written += 1
        return written

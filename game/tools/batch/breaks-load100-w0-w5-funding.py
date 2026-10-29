# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/engine-load100-mana.mjs', 'tests/engine-convoke.mjs']
ACTIONS = 'game/engine/rules/actions.mjs'
MANA = 'game/engine/rules/mana.mjs'
ENTRY = 'game/engine/rules/pre-entry.mjs'
BREAKS = [
    ('exiled casts may tap sources', ACTIONS,
     '["hand", "command", "exile", "graveyard", "library"].includes(from)',
     '["hand", "command", "graveyard", "library"].includes(from)'),
    ('alternative casts may tap sources', ACTIONS,
     'const tapCastable = (state, player, action) => tapZone(state, player, action.from, action.objectId)',
     'const tapCastable = (state, player, action) => action.alternative === undefined && tapZone(state, player, action.from, action.objectId)'),
    ('funding prices the chosen alternative cost', ACTIONS,
     'return {...reckoned, cost: anyTypeCost(reckoned.cost, permission)};',
     'return {...reckoned, cost: parseManaCost(state.objects[action.objectId].manaCost)};'),
    ('alternative affordability includes untapped sources', ACTIONS,
     '&& (xMana === null || tapsForX) && !tapsAny',
     '&& (xMana === null || tapsForX) && !way && !tapsAny'),
    ('public source choices have no twenty-four cap', ACTIONS,
     'const TAP_CHOICES = Infinity;', 'const TAP_CHOICES = 24;'),
    ('payment enumeration has no twelve cap', MANA,
     'export function paymentOptions(pool, cost, options = {}, limit = Infinity)',
     'export function paymentOptions(pool, cost, options = {}, limit = 12)'),
    ('public pool choices have no twelve cap', MANA,
     'export const PAY_CHOICES = Infinity;', 'export const PAY_CHOICES = 12;'),
    ('effect-paid choices have no twelve cap', MANA,
     'export function unlessPlans(state, player, cost, limit = Infinity)',
     'export function unlessPlans(state, player, cost, limit = 12)'),
    ('unrevealable lands finish tapped entry', ENTRY,
     'if (data.reveal && !choice.options.some(option => option.reveal !== undefined && option.reveal !== null))',
     'if (false)'),
]

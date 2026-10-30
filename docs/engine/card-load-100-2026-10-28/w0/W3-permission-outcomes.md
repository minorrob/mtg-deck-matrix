# Supported play-permission outcomes

Audit of `actions.mjs` at the resumed integrated wave-0 baseline. This does not grant general MayPlay construct credit.

`permissionDoes` retains the following supported runtime outcomes. Unlimited permissions are grouped only when this
signature matches; limited resources additionally identify their source and ability. Array order is preserved.

| Field | Runtime consumer | Why separate |
| --- | --- | --- |
| `grants` | `grantPlayed`, spell entry grants | Permanent abilities after play |
| `gains` | Cast from library, spell entry gains | Characteristics of the resulting permanent |
| `payLife` | `lifeInstead`, `castTerms`, `castOffers` | Life rather than mana payment |
| `free` | `castTerms`, `castOffers` | Whether the mana cost is paid |
| `manaInstead` | `castTerms`, `castOffers`, `perform` | Alternative mana cost |
| `additionalCost` | `additionalVariants`, additional-paid handling | Additional payment and its provenance |
| `anyMana` | `anyTypeCost` | Which mana may pay |
| `graveyardToExile` | Spell entry, stack finishing | Exile rather than graveyard after resolution/countering |
| `graveyardToLibraryBottom` | Spell entry, stack finishing | Library rather than graveyard after resolution/countering |
| `sorcery` | `castOffers` timing check | This restriction is checked after permission grouping |

Availability is evaluated before grouping by `permissionOpen`, `permittedFrom`, and `permits`: `zone`, `ids`, `spells`,
`lands`, `condition`, `yourTurn`, `afterTurn`, and `notAdventure`. Finite `limit`, `perType`, and `count` resources are
keyed separately by source and ability. Their remaining-use checks precede grouping, and only the selected resource
is consumed. These are availability/resource fields rather than omitted cast outcomes.

V8's alternative-mana-cost regression is red before `b66ae95a`: unlimited `{2}` and `{3}` permissions collapse into one
unlabeled offer. The focused suite now proves both explicit payments after reload, with unlimited and finite variants.
Its exile-on-finish regression is red before this increment: two unlimited static gates collapse despite different
destinations. The suite now proves both actual stack riders and eventual destinations. A plotted-card timing fixture
proves that a saved sorcery restriction cannot hide an unrestricted instant-speed permission. The fixture uses the
saved restriction written by plot; the `mayPlay` effect descriptor itself does not accept a `sorcery` field.

All existing resource/zone assertions remain. Omission mutations for alternative mana, exile rider, and sorcery timing
are caught. The existing unlimited-equivalence mutation remains required; distinct costs or destinations are not
treated as equivalent. Affordability before floating mana and unimplemented MayPlay forms remain separate open debts.

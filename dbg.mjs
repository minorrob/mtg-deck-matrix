const {loadCardIndex, loadCardScenarios} = await import("./game/tools/engine-cards.mjs");
const {runScenario} = await import("./game/engine/cards/scenario.mjs");
const ix = loadCardIndex();
const file = loadCardScenarios().find((f) => f.scenarios.card === "Kambal, Profiteering Mayor").scenarios;
const sc = structuredClone(file.scenarios[0]);
for (let k = 1; k <= sc.steps.length; k += 1) {
  try {
    const {state} = runScenario({...sc, steps: sc.steps.slice(0, k), expect: []}, ix.definition, file.fixtures || {});
    const bf = state.zones.battlefield.map((id) => `${state.objects[id].card}/${state.objects[id].controller}${state.objects[id].tapped ? "T" : ""}`).join(",");
    console.log("after", k, JSON.stringify(sc.steps[k - 1]), "| stack:", state.stack.map((e) => e.text ?? e.abilityId ?? e.kind).join(";"), "| bf:", bf, "| life", state.players.map((p) => p.life).join("/"), "| pending", (state.pendingTriggers ?? []).length);
  } catch (e) { console.log("fails at", k, e.message); break; }
}

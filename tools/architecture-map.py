#!/usr/bin/env python3
"""THE ARCHITECTURE PAGE'S FACTS (M11, docs/plan-to-100.md), over engram's graph.

docs/architecture/map.sh calls this between engram's own stages. It runs in a cloud session with
engram cloned beside the repository (Rob, 2026-09-25) and reads YAML through engram's vendored
PyYAML, so the repository still declares no dependency.

  describe-survey <survey.yaml>   write the system's purpose into engram's survey (the GRAPH GUIDE framing)
  current <kg>                    the CURRENT layer: parse the code (D1 tables from cloud/migrations, the
                                  Worker's routes from cloud/worker.mjs) and run each piece's probe from
                                  docs/architecture/model/pieces.yaml; a piece is emitted only when the code
                                  proves it, with an evidenced-by edge to the mapped file's node.
                                  Writes <kg>/config-architecture.json, which engram's kg_build merges.
  final <kg-final>                the FINAL layer: every piece that names requirements, status: intent, with
                                  traces-to edges to engram's forward-model Requirement nodes and realized-by
                                  edges to its forward-model containers. Carries the classification over.
  page                            project both built graphs into docs/architecture/architecture.json and embed
                                  it in docs/architecture/index.html. A piece's status is its membership in the
                                  two graphs: in both, only final, or only current (retiring).

Classification follows engram's rule for exports: a confidential node reaches the page as its name and kind.
"""
from __future__ import annotations
import json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENGRAM = os.environ.get("ENGRAM") or os.path.join(os.path.dirname(ROOT), "engram")
sys.path.insert(0, os.path.join(ENGRAM, "skills", "map-codebase", "scripts", "vendor"))
import yaml  # engram's vendored PyYAML

MODEL = os.path.join(ROOT, "docs", "architecture", "model", "pieces.yaml")
KG = os.path.join(ROOT, "docs", "architecture", ".kg")
FINAL = os.path.join(KG, "final")
DATA = os.path.join(ROOT, "docs", "architecture", "architecture.json")
PAGE = os.path.join(ROOT, "docs", "architecture", "index.html")
# engram's canonical graph file in each .kg folder. Spelled in two parts because tools/data-inventory.mjs
# attributes every tool that names a data file's basename to that file, and this is engram's file, not the app's relationship graph under data/.
GRAPH = "graph" + ".json"
CUSTOM = {"D1Table", "D1Field", "WorkerRoute", "R2Object", "DurableObjectRoom", "OutsideSource", "RecordType",
          "RecordField", "NetworkNode", "Secret", "DataFlow", "Journey", "JourneyStep"}
MIGRATIONS = "cloud/migrations/0001_accounts.sql"
WORKER = "cloud/worker.mjs"


def load_model():
    with open(MODEL, encoding="utf-8") as f:
        return yaml.safe_load(f)


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def line_of(text, index):
    return text.count("\n", 0, index) + 1


def probe(p):
    """{file, match} -> {file, line} when the regex matches the file today, else None."""
    if not isinstance(p, dict) or "file" not in p:
        return None
    try:
        text = read(p["file"])
    except OSError:
        return None
    m = re.search(p["match"], text)
    return {"file": p["file"], "line": line_of(text, m.start())} if m else None


def mapped_files(kg):
    """file -> node id for every mapped module, document and workflow in engram's current graph."""
    with open(os.path.join(kg, GRAPH), encoding="utf-8") as f:
        g = json.load(f)
    out = {}
    for n in g["nodes"]:
        if n["kind"] in ("CodeModule", "Document", "ConfigObject") and n.get("file") and "#" not in n["id"]:
            out.setdefault(n["file"], n["id"])
    return out


def field_id(table_id, name):
    return f"{table_id}.{name}"


def base_node(piece, kind=None):
    n = {"id": piece["id"], "kind": kind or piece["kind"], "name": piece.get("name", piece["id"])}
    for k in ("origin", "place", "detail", "variable", "person"):
        if piece.get(k) is not None:
            n[k] = piece[k]
    return n


# ────────────────────────────── the current layer ──────────────────────────────

def parse_d1():
    """CREATE TABLE blocks -> {table: {line, columns: [(name, type, line)], refs: [(col, table, col)]}}."""
    sql = read(MIGRATIONS)
    tables = {}
    for m in re.finditer(r"CREATE TABLE (\w+) \((.*?)\n\);", sql, re.S):
        name, body, start = m.group(1), m.group(2), m.start(2)
        cols, refs = [], []
        offset = start
        for raw in body.split("\n"):
            ln = line_of(sql, offset)
            offset += len(raw) + 1
            s = raw.strip()
            c = re.match(r"(\w+)\s+([A-Z]+)", s)
            if not c or c.group(1).upper() in ("PRIMARY", "FOREIGN", "UNIQUE", "CHECK"):
                continue
            cols.append((c.group(1), c.group(2), ln))
            r = re.search(r"REFERENCES (\w+)\((\w+)\)", s)
            if r:
                refs.append((c.group(1), r.group(1), r.group(2)))
        tables[name] = {"line": line_of(sql, m.start()), "columns": cols, "refs": refs}
    return tables


def parse_routes():
    """The Worker's own route table, in its header comment: ' *   GET  /api/me   ...'."""
    text = read(WORKER)
    out = []
    for m in re.finditer(r"^ \*\s+(GET|PUT|POST|DELETE)\s+(/api/\S+?)(\?\S*)?\s", text, re.M):
        out.append((m.group(1), m.group(2), line_of(text, m.start())))
    return out


def current(kg):
    model = load_model()
    files = mapped_files(kg)
    nodes, edges, seen = {}, [], set()

    def evidence(piece_id, ev, via=None):
        target = files.get(ev["file"]) or files.get(via or "")
        if not target:
            sys.exit(f"architecture-map: {piece_id}'s evidence {ev['file']} is not a file engram mapped; widen the survey in map.sh")
        edge(piece_id, target, "evidenced-by", line=ev["line"])

    def edge(f, t, kind, **attrs):
        key = (f, kind, t)
        if key in seen:
            return
        seen.add(key)
        edges.append({"from": f, "to": t, "kind": kind, "source": "parser", **{k: v for k, v in attrs.items() if v not in (None, "")}})

    def add(node, ev, via=None):
        node["file"], node["line"] = ev["file"], ev["line"]
        node["evidence"] = dict(ev)
        nodes[node["id"]] = node
        evidence(node["id"], ev, via)

    listed = {p["id"]: p for p in model["nodes"]}
    tables_listed = {t["id"]: t for t in model["tables"]}

    # D1, parsed. The module that reads and writes each table is its code evidence.
    for tname, t in parse_d1().items():
        tid = f"d1:{tname}"
        piece = tables_listed.get(tid, {"id": tid, "kind": "D1Table", "name": tname})
        n = base_node(piece, "D1Table")
        n["name"] = tname
        add(n, {"file": MIGRATIONS, "line": t["line"]}, via="cloud/library.mjs")
        listed_fields = {f["name"]: f for f in piece.get("fields", [])}
        for (col, ctype, ln) in t["columns"]:
            fid = field_id(tid, col)
            lf = listed_fields.get(col, {})
            fn = {"id": fid, "kind": "D1Field", "name": col, "type": ctype, "table": tid}
            for k in ("meaning", "example", "required", "source", "core"):
                if k in lf:
                    fn[k] = lf[k]
            add(fn, {"file": MIGRATIONS, "line": ln}, via="cloud/library.mjs")
            edge(tid, fid, "has-field")
        for (col, rt, rc) in t["refs"]:
            edge(field_id(tid, col), field_id(f"d1:{rt}", rc), "joins", description="REFERENCES")
        if piece.get("hosted"):
            edge(tid, piece["hosted"], "hosted-on")

    # The Worker's routes, parsed.
    for (method, path, ln) in parse_routes():
        rid = f"route:{method}:{path}"
        piece = listed.get(rid, {"id": rid, "kind": "WorkerRoute", "name": f"{method} {path}"})
        n = base_node(piece, "WorkerRoute")
        add(n, {"file": WORKER, "line": ln})
        edge(rid, "net:worker", "hosted-on")

    # Every other piece, by its probe.
    for p in model["nodes"]:
        if p["id"] in nodes:
            continue
        ev = probe(p.get("current"))
        if ev:
            add(base_node(p), ev)
    for p in model["nodes"]:
        if p["id"] in nodes and p.get("hosted") and p["hosted"] in nodes:
            edge(p["id"], p["hosted"], "hosted-on")

    # Browser records, stores, the room and outside tables, with their fields.
    for t in model["tables"]:
        if t["kind"] != "RecordType":
            continue
        ev = probe(t.get("current"))
        if not ev:
            continue
        add(base_node(t), ev)
        if t.get("hosted") in nodes:
            edge(t["id"], t["hosted"], "hosted-on")
        if t.get("fed") in nodes:
            edge(t["id"], t["fed"], "fed-by")
        text = read(ev["file"])
        for f in t.get("fields", []):
            if f.get("current") is False:
                continue
            pattern = f.get("match") or rf"\b{re.escape(f['name'].split('.')[-1].replace('[]', ''))}\b"
            m = re.search(pattern, text)
            if not m:
                continue
            fid = field_id(t["id"], f["name"])
            fn = {"id": fid, "kind": "RecordField", "name": f["name"], "table": t["id"]}
            for k in ("type", "meaning", "example", "required", "source", "core"):
                if k in f:
                    fn[k] = f[k]
            add(fn, {"file": ev["file"], "line": line_of(text, m.start())})
            edge(t["id"], fid, "has-field")

    # Joins declared in the model hold today when both of their fields exist today.
    for t in model["tables"]:
        for f in t.get("fields", []):
            j = f.get("joins")
            a = field_id(t["id"], f["name"])
            if j and a in nodes and j["to"] in nodes:
                edge(a, j["to"], "joins", cardinality=j.get("cardinality"))

    # Links (the network view's lines): today only where the code proves the connection.
    for l in model["links"]:
        ev = probe(l.get("current"))
        if ev and l["from"] in nodes and l["to"] in nodes:
            edge(l["from"], l["to"], "connects-to", protocol=l.get("protocol"), auth=l.get("auth"),
                 policy=l.get("policy"), description=l.get("description"), evidence=f"{ev['file']}:{ev['line']}")

    # Flows and journeys that happen today, with the steps that exist today.
    for fl in model["flows"]:
        ev = probe(fl.get("current"))
        if not ev:
            continue
        n = base_node({**fl, "kind": "DataFlow"})
        add(n, ev)
        for i, s in enumerate(fl["steps"], 1):
            if s["piece"] in nodes:
                edge(fl["id"], s["piece"], "flow-step", order=i, action=s["action"])
    for jr in model["journeys"]:
        jev = probe(jr.get("current"))
        steps_now = [(i, s, probe(s.get("current"))) for i, s in enumerate(jr["steps"], 1)]
        if not jev and not any(ev for _, _, ev in steps_now):
            continue
        add(base_node({**jr, "kind": "Journey"}), jev or next(ev for _, _, ev in steps_now if ev))
        for i, s, ev in steps_now:
            if not ev:
                continue
            sid = f"jstep:{jr['id'].split(':', 1)[1]}.{i}"
            add({"id": sid, "kind": "JourneyStep", "name": s["text"], "journey": jr["id"], "order": i}, ev)
            edge(jr["id"], sid, "journey-step", order=i)
            for fl in s.get("flows", []):
                if fl in nodes:
                    edge(sid, fl, "uses-flow")
            for t in s.get("touches", []):
                if t in nodes:
                    edge(sid, t, "touches")

    out = {"generated_by": "tools/architecture-map.py current", "nodes": list(nodes.values()), "edges": edges}
    with open(os.path.join(kg, "config-architecture.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    print(f"architecture-map current: {len(nodes)} pieces proven by the code, {len(edges)} edges")


# ────────────────────────────── the final layer ──────────────────────────────

def final(kg_final):
    model = load_model()
    nodes, edges, seen = {}, [], set()
    with open(os.path.join(kg_final, "requirements.yaml"), encoding="utf-8") as f:
        reqs = {n["id"] for n in yaml.safe_load(f)["nodes"]}
    with open(os.path.join(kg_final, "c4.yaml"), encoding="utf-8") as f:
        c4 = {n["id"] for n in yaml.safe_load(f)["nodes"]}

    def edge(f, t, kind, **attrs):
        key = (f, kind, t)
        if key in seen:
            return
        seen.add(key)
        edges.append({"from": f, "to": t, "kind": kind, "source": "model", **{k: v for k, v in attrs.items() if v not in (None, "")}})

    def add(node, final_ids):
        rids = [f"req:{r}" for r in final_ids]
        missing = [r for r in rids if r not in reqs]
        if missing:
            sys.exit(f"architecture-map: {node['id']} traces to {missing}, which the forward model does not hold")
        node["status"] = "intent"
        nodes[node["id"]] = node
        for r in rids:
            edge(node["id"], r, "traces-to")

    for p in model["nodes"]:
        if p.get("final"):
            add(base_node(p), p["final"])
            if p.get("realizes"):
                cid = f"c4:container.{p['realizes']}"
                if cid not in c4:
                    sys.exit(f"architecture-map: {p['id']} realizes {cid}, which the forward model does not hold")
                edge(p["id"], cid, "realized-by")
    for p in model["nodes"]:
        if p.get("final") and p.get("hosted"):
            edge(p["id"], p["hosted"], "hosted-on")
    for t in model["tables"]:
        if not t.get("final"):
            continue
        add(base_node(t), t["final"])
        if t.get("hosted"):
            edge(t["id"], t["hosted"], "hosted-on")
        if t.get("fed"):
            edge(t["id"], t["fed"], "fed-by")
        fkind = "D1Field" if t["kind"] == "D1Table" else "RecordField"
        for f in t.get("fields", []):
            fid = field_id(t["id"], f["name"])
            fn = {"id": fid, "kind": fkind, "name": f["name"], "table": t["id"]}
            for k in ("type", "meaning", "example", "required", "source", "core"):
                if k in f:
                    fn[k] = f[k]
            add(fn, f.get("final") or t["final"])
            edge(t["id"], fid, "has-field")
    for t in model["tables"]:
        for f in t.get("fields", []):
            j = f.get("joins")
            a = field_id(t["id"], f["name"])
            if j and a in nodes:
                if j["to"] not in nodes:
                    sys.exit(f"architecture-map: {a} joins {j['to']}, which the final state does not hold")
                edge(a, j["to"], "joins", cardinality=j.get("cardinality"))
    for l in model["links"]:
        if l.get("final"):
            for end in (l["from"], l["to"]):
                if end not in nodes:
                    sys.exit(f"architecture-map: a final link names {end}, which the final state does not hold")
            edge(l["from"], l["to"], "connects-to", protocol=l.get("protocol"), auth=l.get("auth"),
                 policy=l.get("policy"), description=l.get("description"))
    for fl in model["flows"]:
        if not fl.get("final"):
            continue
        add(base_node({**fl, "kind": "DataFlow"}), fl["final"])
        for i, s in enumerate(fl["steps"], 1):
            if s["piece"] not in nodes:
                sys.exit(f"architecture-map: {fl['id']} step {i} names {s['piece']}, which the final state does not hold")
            edge(fl["id"], s["piece"], "flow-step", order=i, action=s["action"])
    for jr in model["journeys"]:
        if not jr.get("final"):
            continue
        add(base_node({**jr, "kind": "Journey"}), jr["final"])
        for i, s in enumerate(jr["steps"], 1):
            if not s.get("final"):
                continue
            sid = f"jstep:{jr['id'].split(':', 1)[1]}.{i}"
            add({"id": sid, "kind": "JourneyStep", "name": s["text"], "journey": jr["id"], "order": i}, s["final"])
            edge(jr["id"], sid, "journey-step", order=i)
            for fl in s.get("flows", []):
                edge(sid, fl, "uses-flow")
            for t in s.get("touches", []):
                if t not in nodes:
                    sys.exit(f"architecture-map: {sid} touches {t}, which the final state does not hold")
                edge(sid, t, "touches")

    # One classification file governs both graphs: carry the current survey's block over.
    with open(os.path.join(KG, "survey.yaml"), encoding="utf-8") as f:
        cls = (yaml.safe_load(f) or {}).get("classification")
    sp = os.path.join(kg_final, "survey.yaml")
    with open(sp, encoding="utf-8") as f:
        survey = yaml.safe_load(f) or {}
    if cls:
        survey["classification"] = cls
    with open(sp, "w", encoding="utf-8") as f:
        yaml.safe_dump(survey, f, sort_keys=False, allow_unicode=True, width=120)
    out = {"generated_by": "tools/architecture-map.py final", "nodes": list(nodes.values()), "edges": edges}
    with open(os.path.join(kg_final, "config-architecture.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    print(f"architecture-map final: {len(nodes)} pieces in the final state, {len(edges)} edges")


# ────────────────────────────── the page's data ──────────────────────────────

KEEP = ("origin", "place", "detail", "person", "type", "meaning", "example", "required", "source", "core", "table", "journey", "order")


def status_of(in_current, in_final):
    return "both" if in_current and in_final else ("final" if in_final else "current")


def redacted(n):
    return n.get("classification") == "confidential"


def page():
    model = load_model()
    graphs = {}
    for key, path in (("current", KG), ("final", FINAL)):
        with open(os.path.join(path, GRAPH), encoding="utf-8") as f:
            graphs[key] = json.load(f)
    cur = {n["id"]: n for n in graphs["current"]["nodes"] if n["kind"] in CUSTOM}
    fin = {n["id"]: n for n in graphs["final"]["nodes"] if n["kind"] in CUSTOM}
    reqs = {n["id"]: n for n in graphs["final"]["nodes"] if n["kind"] == "Requirement"}
    ekey = lambda e: (e["from"], e["kind"], e["to"])
    cur_e = {ekey(e): e for e in graphs["current"]["edges"]}
    fin_e = {ekey(e): e for e in graphs["final"]["edges"]}

    pieces = {}
    for pid in sorted(set(cur) | set(fin)):
        c, f = cur.get(pid), fin.get(pid)
        src = f or c
        p = {"id": pid, "kind": src["kind"], "name": src["name"], "status": status_of(c is not None, f is not None),
             "classification": src.get("classification", "internal")}
        if redacted(src):
            p["withheld"] = True          # name and kind only, plus where it sits: its table and whether the diagram shows it
            for k in ("table", "core", "place"):
                if src.get(k) is not None:
                    p[k] = src[k]
        else:
            for k in KEEP:
                if src.get(k) is not None:
                    p[k] = src[k]
            if c and c.get("evidence"):
                p["evidence"] = c["evidence"]
            if f:
                p["traces"] = sorted(e[2] for e in fin_e if e[0] == pid and e[1] == "traces-to")
            realized = [e[2] for e in fin_e if e[0] == pid and e[1] == "realized-by"]
            if realized:
                p["realizedBy"] = realized
        pieces[pid] = p

    def edges_of(kind):
        out = []
        for k in sorted(set(k for k in cur_e if k[1] == kind) | set(k for k in fin_e if k[1] == kind)):
            e = fin_e.get(k) or cur_e.get(k)
            row = {"from": k[0], "to": k[2], "status": status_of(k in cur_e, k in fin_e)}
            for a in ("protocol", "auth", "policy", "description", "cardinality", "order", "action", "evidence"):
                v = (fin_e.get(k) or {}).get(a) or (cur_e.get(k) or {}).get(a)
                if v is not None:
                    row[a] = v
            out.append(row)
        return out

    has_field = edges_of("has-field")
    for e in has_field:
        pieces[e["from"]].setdefault("fields", []).append(e["to"])
    order = {}
    for t in model["tables"]:
        for i, f in enumerate(t.get("fields", [])):
            order[field_id(t["id"], f["name"])] = i
    for p in pieces.values():
        if "fields" in p:
            p["fields"].sort(key=lambda fid: (order.get(fid, 99), fid))
    for e in edges_of("hosted-on"):
        pieces[e["from"]]["hostedOn"] = e["to"]
    for e in edges_of("fed-by"):
        pieces[e["from"]]["fedBy"] = e["to"]

    flows = []
    for fl in model["flows"]:
        if fl["id"] not in pieces:
            continue
        steps = [{"order": i, "piece": s["piece"], "action": s["action"]} for i, s in enumerate(fl["steps"], 1)]
        flows.append({"id": fl["id"], "steps": steps})
    journeys = []
    for jr in model["journeys"]:
        if jr["id"] not in pieces:
            continue
        steps = []
        for i, s in enumerate(jr["steps"], 1):
            sid = f"jstep:{jr['id'].split(':', 1)[1]}.{i}"
            if sid in pieces:
                steps.append({"id": sid, "touches": s.get("touches", []), "flows": s.get("flows", [])})
        journeys.append({"id": jr["id"], "steps": steps})

    used = sorted({r for p in pieces.values() for r in p.get("traces", [])})
    data = {
        "schema": "crankmagic-architecture@1",
        "about": "Drawn from engram's graphs: the current map (docs/architecture/.kg) and the forward model (docs/architecture/.kg/final). A piece's status is its membership in them.",
        "graphs": {k: {"path": f"docs/architecture/.kg/{GRAPH}" if k == "current" else f"docs/architecture/.kg/final/{GRAPH}",
                       "generatedAt": g["meta"]["generatedAt"], "nodes": g["meta"]["counts"]["nodes"], "edges": g["meta"]["counts"]["edges"]}
                   for k, g in graphs.items()},
        "lanes": model["lanes"],
        "glossary": model["glossary"],
        "requirements": {r: {"text": reqs[r].get("text", ""), "source": (reqs[r].get("source") or {}).get("node", "")} for r in used},
        "pieces": pieces,
        "links": edges_of("connects-to"),
        "joins": edges_of("joins"),
        "flows": flows,
        "journeys": journeys,
    }
    text = json.dumps(data, indent=1, ensure_ascii=False) + "\n"
    with open(DATA, "w", encoding="utf-8") as f:
        f.write(text)
    embed(text)
    counts = {s: sum(1 for p in pieces.values() if p["status"] == s) for s in ("both", "final", "current")}
    print(f"architecture-map page: {len(pieces)} pieces {counts}; {len(data['links'])} links, {len(data['joins'])} joins, {len(flows)} flows, {len(journeys)} journeys")


START, END = '<script type="application/json" id="architecture-data">', "</script><!-- /architecture-data -->"


def embed(text):
    """The page carries its data inline so it opens anywhere, from a file or a share link, with no request."""
    with open(PAGE, encoding="utf-8") as f:
        html = f.read()
    a, b = html.index(START) + len(START), html.index(END)
    safe = text.replace("</", "<\\/")
    with open(PAGE, "w", encoding="utf-8") as f:
        f.write(html[:a] + "\n" + safe + html[b:])


def describe_survey(path):
    with open(path, encoding="utf-8") as f:
        s = yaml.safe_load(f)
    s["description"] = ("CrankMagic: a Commander deck workshop (decks, library, explore) served from Cloudflare at "
                        "crankmagic.com, with invite-only accounts that sync a library to D1, and a clean-room rules "
                        "engine (CME) that will host Play in Durable Objects.")
    s["notes"] = ["Scoped to the code that carries the architecture: the served app, the account Worker (cloud/), the "
                  "engine and the frozen local game host, the release builder and data tools, the CI workflows, and the "
                  "plans that define the final state.",
                  "The final state is forward-modeled in docs/architecture/.kg/final from docs/architecture/model/intent.yaml."]
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump(s, f, sort_keys=False, allow_unicode=True, width=120)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "current":
        current(sys.argv[2])
    elif cmd == "final":
        final(sys.argv[2])
    elif cmd == "page":
        page()
    elif cmd == "describe-survey":
        describe_survey(sys.argv[2])
    else:
        sys.exit(__doc__)

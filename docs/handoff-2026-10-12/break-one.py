# break-one.py <breaks file> <label>...: apply each named break alone, run that file's SUITES until one fails, restore.
import runpy, subprocess, sys
f = sys.argv[1]; g = runpy.run_path(f)
for label in sys.argv[2:]:
    b = [x for x in g["BREAKS"] if x[0] == label][0]
    path, find, repl = b[1], b[2], b[3]
    text = open(path).read()
    assert text.count(find) == 1, (label, text.count(find))
    try:
        open(path, "w").write(text.replace(find, repl))
        caught = None
        for s in g["SUITES"]:
            r = subprocess.run(["node", "--stack-size=4000", s], capture_output=True, text=True, timeout=1800)
            if r.returncode != 0: caught = s; break
    finally:
        open(path, "w").write(text)
    print(("caught by " + caught) if caught else "MISSED", "|", label)

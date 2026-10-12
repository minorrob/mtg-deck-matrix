import sys, re
p = sys.argv[1]
t = open(p).read()
out, i = [], 0
pat = re.compile(r"<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n", re.S)
def rep(m):
    ours, theirs = m.group(1), m.group(2)
    if "Node suites here" in ours: return ours
    return ours + theirs
t = pat.sub(rep, t)
assert "<<<<<<<" not in t and ">>>>>>>" not in t
open(p, "w").write(t)

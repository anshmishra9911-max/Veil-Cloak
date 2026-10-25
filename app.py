"""Invisibility Cloak - Flask backend.

Serves the page, the palette/quotes config, and a tiny per-browser
store for saved cloak setups (max 5). Run:  python app.py [--https]
"""
import json
import sys
import uuid
from pathlib import Path

from flask import Flask, jsonify, make_response, render_template, request

BASE = Path(__file__).parent
DB_FILE = BASE / "data" / "setups.json"
MAX_SETUPS = 5
BLENDS = ("solid", "ghost", "shimmer")

app = Flask(__name__)

# ---- Content -------------------------------------------------------------
COLORS = [(n, h) for n, h in [
    ("Crimson", "#DC143C"), ("Scarlet", "#FF2400"), ("Ruby", "#E0115F"),
    ("Emerald", "#50C878"), ("Jade", "#00A86B"), ("Forest Green", "#228B22"),
    ("Sapphire", "#0F52BA"), ("Azure", "#007FFF"), ("Cobalt", "#0047AB"),
    ("Amethyst", "#9966CC"), ("Violet", "#8F00FF"), ("Magenta", "#FF00FF"),
    ("Rose", "#FF66A3"), ("Gold", "#FFD700"), ("Amber", "#FFBF00"),
    ("Bronze", "#CD7F32"), ("Silver", "#C0C0C0"), ("Platinum", "#E5E4E2"),
    ("Obsidian", "#1B1B24"), ("Onyx", "#353839"), ("Pearl", "#EAE0C8"),
    ("Turquoise", "#40E0D0"), ("Coral", "#FF7F50"), ("Midnight Blue", "#191970"),
]]

QUOTES = [
    "I'd tell you a joke about invisibility, but you wouldn't see it coming.",
    "My cloaking device is great — my friends keep 'losing' me.",
    "Invisible? No, I'm just introverted with extra steps.",
    "I put on my invisibility cloak and suddenly everyone needs me.",
    "Why did the wizard fail hide-and-seek? He kept laughing at his own disappearing act.",
    "Nothing to see here. Literally.",
    "I wore my cloak to a meeting. Nobody noticed. Same as usual.",
    "Invisibility cloaks: because 'I'm not here' is a lifestyle.",
    "My cloak is so good, even my Wi-Fi can't find me.",
    "Plot twist: the cloak was never the magic. The calibration was.",
    "I'm not hiding from chores. I'm just currently undetectable.",
    "Be the background you wish to see in the world.",
]

# ---- Persistence helpers ---------------------------------------------------
def _load() -> dict:
    try:
        return json.loads(DB_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def _save(db: dict) -> None:
    DB_FILE.parent.mkdir(exist_ok=True)
    DB_FILE.write_text(json.dumps(db))

def _clean(s):
    """Validate one setup dict; return a sanitized copy or None."""
    if not isinstance(s, dict):
        return None
    try:
        color = str(s["color"])
        if len(color) != 7 or not color.startswith("#"):
            return None
        int(color[1:], 16)
        return {
            "name": str(s.get("name", ""))[:30], "color": color,
            "opacity": max(0, min(100, int(s["opacity"]))),
            "threshold": max(1, min(100, int(s["threshold"]))),
            "blend": s["blend"] if s["blend"] in BLENDS else "solid",
        }
    except (KeyError, ValueError, TypeError):
        return None

# ---- Routes ----------------------------------------------------------------
@app.get("/")
def index():
    return render_template("index.html")

@app.get("/api/config")
def config():
    return jsonify(colors=[{"name": n, "hex": h} for n, h in COLORS],
                   quotes=QUOTES, blends=BLENDS, maxSetups=MAX_SETUPS)

@app.route("/api/setups", methods=["GET", "POST"])
def setups():
    cid = request.cookies.get("cid") or uuid.uuid4().hex
    db = _load()
    if request.method == "POST":
        body = request.get_json(silent=True)
        if not isinstance(body, list) or len(body) > MAX_SETUPS:
            return jsonify(error="Expected a list of up to 5 setups"), 400
        db[cid] = [_clean(s) for s in body]
        _save(db)
    resp = make_response(jsonify(setups=db.get(cid, [None] * MAX_SETUPS)))
    resp.set_cookie("cid", cid, max_age=60 * 60 * 24 * 365, samesite="Lax")
    return resp

@app.get("/health")
def health():
    return jsonify(status="ok")

@app.errorhandler(404)
def not_found(_):
    return jsonify(error="Nothing here. Perhaps it's invisible?"), 404

if __name__ == "__main__":
    https = "--https" in sys.argv
    print("Open", "https" if https else "http", "://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False,
            ssl_context="adhoc" if https else None)

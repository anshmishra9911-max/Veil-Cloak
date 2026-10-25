# Veil — Invisibility Cloak Studio

A Flask + Three.js web app that makes a coloured cloth invisible in your live webcam feed.
Video is processed in your browser; nothing is uploaded.

## Run it

```bash
cd invisibility-cloak
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open **http://localhost:5000**.

### On your phone (same Wi-Fi)

Browsers only allow camera access on HTTPS or localhost, so run:

```bash
python app.py --https
```

Then open `https://<your-pc-ip>:5000` on the phone and accept the self-signed certificate warning.

## Using it

1. **Start camera** and allow access.
2. **Calibrate background**, then step out of frame for 3 seconds while it captures.
3. Pick the swatch that matches your cloth and adjust **tolerance** until the cloth disappears cleanly.
4. **Save** up to 5 setups (colour, tolerance, opacity, blend mode) and tap a slot to switch instantly.

Tips: use a plain, matte, saturated cloth; keep lighting even; don't move the camera after calibrating.

## Project layout

```
app.py              Flask routes, palette, quotes, setup storage (data/setups.json)
templates/index.html
static/style.css
static/script.js    Webcam, cloak pixel processing, Three.js stage, UI
requirements.txt
```

## Free hosting

Deploy the folder to any host that supports Flask over HTTPS (for example Render or PythonAnywhere free tiers) with start command `gunicorn app:app`. Add `gunicorn` to requirements first. HTTPS is required for the camera.

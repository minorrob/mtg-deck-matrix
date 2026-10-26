"""Side by side: the walkthrough's P03 capture (1920 frame scaled to 1568) and the r4 Decks hub rendered at 1920 and scaled the same way."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
R = Path(__file__).resolve().parents[1] / 'renders' / 'before-after'
before = Image.open(R / 'before-P03-moss-iron.jpg').convert('RGB')
after = Image.open(R / 'after-decks-hub-1920.png').convert('RGB')
after = after.resize((1568, int(after.size[1] * 1568 / 1920)), Image.LANCZOS)
H = max(before.size[1], after.size[1]); pad, top = 40, 90; W = 1568 * 2 + pad * 3
canvas = Image.new('RGB', (W, H + top + pad), (20, 20, 24)); canvas.paste(before, (pad, top)); canvas.paste(after, (pad * 2 + 1568, top))
d = ImageDraw.Draw(canvas)
try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 34)
except OSError: f = ImageFont.load_default()
d.text((pad, 22), 'Before · live app, Moss & Iron · walkthrough P03, 2026-10-25', fill=(240, 240, 244), font=f)
d.text((pad * 2 + 1568, 22), 'After · r4 Sapphire & Obsidian, dark · same 1920 frame, scaled to 1568', fill=(240, 240, 244), font=f)
canvas.save(R / 'decks-hub-before-after.png'); print('before/after', canvas.size)

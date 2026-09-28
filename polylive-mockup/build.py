#!/usr/bin/env python3
"""build.py — Genera dist/polylive-planta.html y dist/polylive-alzado.html
(archivos únicos autocontenidos). Incrusta CSS y JS en orden."""
import re
from pathlib import Path

ROOT = Path(__file__).parent

def inline(html_name, out_name):
    html = (ROOT / html_name).read_text(encoding='utf-8')
    def css(m): return '<style>\n' + (ROOT / m.group(1)).read_text(encoding='utf-8') + '</style>'
    def js(m):
        src = m.group(1)
        return f'<script>/* ==== {src} ==== */\n' + (ROOT / src).read_text(encoding='utf-8') + '</script>'
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
    html = re.sub(r'<script src="([^"]+)"></script>', js, html)
    out = ROOT / 'dist' / out_name
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding='utf-8')
    print(f'OK → dist/{out_name} ({len(html)/1024:.1f} KB)')

inline('index.html', 'polylive-planta.html')
inline('alzado.html', 'polylive-alzado.html')

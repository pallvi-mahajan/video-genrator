"""Builds colab/Character_Video_Studio.ipynb (run: python tools/make_notebook.py)."""
import json
from pathlib import Path

md = lambda s: {"cell_type": "markdown", "metadata": {}, "source": s.strip("\n")}
code = lambda s: {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": s.strip("\n")}

cells = [
    md("""
# Character Video Studio on free Google Colab

Make character videos (text, your own photo, voice and lip-sync) on Google's **free GPU**. No credits or API keys needed.

**Before you start:** menu **Runtime → Change runtime type → T4 GPU → Save**.

1. Run cell 1. It gets the code in one of three ways:
   - **GITHUB_URL** set: downloads from GitHub.
   - **USE_GOOGLE_DRIVE** ticked: reads `character-video-agent.zip` from My Drive and saves videos to *My Drive/character-videos*.
   - Neither: shows a **Choose Files** button; pick `character-video-agent.zip` from your computer (no Drive needed).
2. Run cell 2 (first setup takes about 10 minutes: it downloads ~9 GB of models onto Colab, not your Drive).
3. Run cell 3 and click the link to open the app. Without Drive, use the app's **Download MP4** button to keep your videos.
"""),
    code("""
#@title 1. Get the code
import os, subprocess, zipfile
GITHUB_URL = ''  #@param {type:"string"}
USE_GOOGLE_DRIVE = False  #@param {type:"boolean"}
ZIP_ON_DRIVE = '/content/drive/MyDrive/character-video-agent.zip'  #@param {type:"string"}
KEEP_MODELS_ON_DRIVE = False  #@param {type:"boolean"}

APP = '/content/character-video-agent'
OUT = '/content/outputs'
if USE_GOOGLE_DRIVE:
    from google.colab import drive
    drive.mount('/content/drive')
    OUT = '/content/drive/MyDrive/character-videos'
    if KEEP_MODELS_ON_DRIVE:  # faster restarts, but uses ~9 GB of your Drive space
        os.environ['HF_HOME'] = '/content/drive/MyDrive/character-video-models'
os.makedirs(OUT, exist_ok=True)
if not os.path.exists(APP):
    if GITHUB_URL:
        subprocess.run(['git', 'clone', '--depth', '1', GITHUB_URL, APP], check=True)
    elif USE_GOOGLE_DRIVE:
        zipfile.ZipFile(ZIP_ON_DRIVE).extractall('/content')
    else:
        from google.colab import files
        print('Choose character-video-agent.zip from your computer:')
        name = next(iter(files.upload()))
        zipfile.ZipFile(name).extractall('/content')
print('Code ready at', APP, '| videos will be saved to', OUT)
!nvidia-smi --query-gpu=name,memory.total --format=csv
"""),
    code("""
#@title 2. Install and download models (first run takes about 10 min)
!cd /content/character-video-agent && bash setup.sh
"""),
    code("""
#@title 3. Start the app and open it
import time, urllib.request
from google.colab.output import eval_js

log = open('/content/server.log', 'w')
server = subprocess.Popen(['bash', 'start.sh'], cwd=APP, env=dict(os.environ, CVA_OUTPUTS=OUT),
                          stdout=log, stderr=subprocess.STDOUT)
for _ in range(150):
    try:
        urllib.request.urlopen('http://127.0.0.1:7860/api/options')
        break
    except Exception:
        time.sleep(2)
print('Open the app here (keep this Colab tab open):')
print(eval_js('google.colab.kernel.proxyPort(7860)'))
"""),
    code("""
#@title (Optional) Public link to use the app from another device or share it
#@markdown Anyone with this link can use your app while this Colab is running.
!wget -q -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /content/cloudflared && chmod +x /content/cloudflared
import re, threading
tunnel = subprocess.Popen(['/content/cloudflared', 'tunnel', '--url', 'http://127.0.0.1:7860'],
                          stderr=subprocess.PIPE, text=True)
for line in tunnel.stderr:
    m = re.search(r'https://[a-z0-9-]+\\.trycloudflare\\.com', line)
    if m:
        print('Public link:', m.group(0))
        break
threading.Thread(target=lambda: [None for _ in tunnel.stderr], daemon=True).start()  # keep the pipe drained
"""),
    code("""
#@title (Troubleshooting) Show server log
!tail -n 40 /content/server.log
"""),
]

nb = {"nbformat": 4, "nbformat_minor": 0, "cells": cells,
      "metadata": {"accelerator": "GPU", "colab": {"provenance": [], "gpuType": "T4"},
                   "kernelspec": {"name": "python3", "display_name": "Python 3"}}}
for c in cells:  # notebook format stores source as a list of lines
    c["source"] = [l + "\n" for l in c["source"].split("\n")]
    c["source"][-1] = c["source"][-1].rstrip("\n")

out = Path(__file__).resolve().parent.parent / "colab" / "Character_Video_Studio.ipynb"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(nb, indent=1))
print("wrote", out)

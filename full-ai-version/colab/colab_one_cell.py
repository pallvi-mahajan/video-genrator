# Character Video Studio - all-in-one Colab cell (works without Google Drive).
# 1) Runtime > Change runtime type > T4 GPU   2) paste this whole cell into a code cell and press Run.
import os, subprocess, zipfile, time, urllib.request
from google.colab import files, output

APP, OUT = '/content/character-video-agent', '/content/outputs'
os.makedirs(OUT, exist_ok=True)
if not os.path.exists(APP):
    zips = [f for f in os.listdir('/content') if f.startswith('character-video-agent') and f.endswith('.zip')]
    if not zips:
        print('Click "Choose Files" and pick character-video-agent.zip from your Downloads folder:')
        zips = [next(iter(files.upload()))]
    zipfile.ZipFile('/content/' + zips[0]).extractall('/content')
print('Code ready. Installing + downloading models (first time ~10 min)...')

if not os.path.exists(APP + '/.setup_done'):
    r = subprocess.run(['bash', 'setup.sh'], cwd=APP, capture_output=True, text=True)
    print(r.stdout[-3000:], r.stderr[-3000:])
    r.check_returncode()
    open(APP + '/.setup_done', 'w').close()

if subprocess.run(['curl', '-s', 'http://127.0.0.1:7860/api/options'], capture_output=True).returncode != 0:
    subprocess.Popen(['bash', 'start.sh'], cwd=APP, env=dict(os.environ, CVA_OUTPUTS=OUT),
                     stdout=open('/content/server.log', 'w'), stderr=subprocess.STDOUT)
for _ in range(150):
    try:
        urllib.request.urlopen('http://127.0.0.1:7860/api/options'); break
    except Exception:
        time.sleep(2)

print('App is running. Open it with this link (keep this tab open):')
output.serve_kernel_port_as_window(7860)
print('...or use it right here below:')
output.serve_kernel_port_as_iframe(7860, height=1100)

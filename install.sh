#!/bin/sh
# Start the panel on boot, from wherever this folder is. Run it once: ./install.sh
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
[ -f "$DIR/config.json" ] || { cp "$DIR/config.example.json" "$DIR/config.json"; echo "Made config.json from the example: fill it in, then run ./install.sh again."; exit 0; }
python3 -c "import PIL" 2>/dev/null || echo "Warning: Pillow isn't installed, so the photo slideshow and the radar won't work. Install it with: sudo apt install python3-pil (Debian / Raspberry Pi OS) or pip install pillow"
mkdir -p "$HOME/.config/systemd/user"
sed "s#%h/work/ipad-panel#$DIR#g" "$DIR/ipad-panel.service" > "$HOME/.config/systemd/user/ipad-panel.service"
systemctl --user daemon-reload
systemctl --user enable --now ipad-panel
sudo loginctl enable-linger "$USER"   # keep it running with nobody logged in
IP=$(hostname -I 2>/dev/null | cut -d' ' -f1)
PORT=$(python3 -c "import json;print(json.load(open('$DIR/config.json')).get('port',8765))")
echo "Running. On the iPad, open http://${IP:-<this computer>}:$PORT"
echo "To connect Spotify from your phone, open http://${IP:-<this computer>}:$PORT/api/spotify/login"

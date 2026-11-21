# Waiting on smart devices

These panel features are built and tested, but they're switched off until the
hardware exists. Each one is a section in `config.json`; the README's
configuration table explains every key. Since 2026-11-21 the panel runs on the
Raspberry Pi (`pishakh`, in `~/ipad-panel`), so edit the `config.json` there. After each
change, restart the server with `ssh pishakh systemctl --user restart ipad-panel`
and check the log with `ssh pishakh journalctl _SYSTEMD_USER_UNIT=ipad-panel.service -n 50`.
The Pi keeps its logs in RAM, so `journalctl --user` shows nothing there.

## Before anything else
- [x] **A real Home Assistant:** on the Pi since 2026-11-21, moved over from the
      Docker one in `ha-dev/` along with its Matter server. Don't start `ha-dev`
      again, because two Matter controllers would fight over the charger plug.
- [ ] The Home Assistant app on your phone. Most of the items below need it.

## When you get them
- [x] **Smart plug for the iPad's charger:** on since 2026-11-13: a Tapo P125M,
      paired to Home Assistant over Matter as `switch.ipad_charger`. It keeps the
      old battery from sitting at full charge around the clock.
      ```json
      "charger": { "entity": "switch.ipad_charger", "on_minutes": 120, "off_minutes": 120 }
      ```
      Watch the first day: if the battery runs low during the off time, shorten
      `off_minutes`.
- [x] **"The iPad went quiet" alerts on your phone:** on since 2026-11-09,
      through ntfy. Since 2026-11-21 they go to the private ntfy server on the Pi
      (topic `ipad-panel`) instead of the public ntfy.sh. In the ntfy app, subscribe
      with the server `https://<pi>.<your-tailnet>.ts.net:8443`; your phone needs
      Tailscale connected. Once the Home Assistant app is on your phone, you can add
      it as a second channel:
      ```json
      "watchdog": { "minutes": 15, "ntfy": "http://127.0.0.1:8081/ipad-panel", "notify": "notify.mobile_app_your_phone" }
      ```
- [ ] **Dim when nobody's home:** your phone as a `person` in Home Assistant.
      ```json
      "presence": ["person.you"]
      ```
- [ ] **Doorbell and front door:** the city's dog runs to the door and barks.
      ```json
      "scene_events": { "doorbell": ["binary_sensor.doorbell"], "door": ["binary_sensor.front_door"] }
      ```
- [ ] Swap the demo entities under `home_assistant.entities` for your real ones.

## Doesn't need any devices
- [x] **Calendar:** on since 2026-11-09 (the link is in config.json). To add another
      calendar, paste its secret iCal address (Settings > that calendar > Secret
      address in iCal format) into the same `ics` list.
      ```json
      "calendar": { "ics": ["https://calendar.google.com/calendar/ical/.../basic.ics"], "days": 3 }
      ```

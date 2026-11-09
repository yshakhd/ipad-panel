# Waiting on smart devices

These panel features are built and tested, but they're switched off until the
hardware exists. Each one is a section in `config.json`; the README's
configuration table explains every key. After each change, restart the server
(`systemctl --user restart ipad-panel`) and check `journalctl --user -u ipad-panel`.

## Before anything else
- [ ] A real Home Assistant (on the Raspberry Pi, or keep the Docker one) with
      the Home Assistant app on your phone. Most of the items below need it.

## When you get them
- [ ] **Smart plug for the iPad's charger:** protects the old battery from
      sitting at full charge around the clock.
      ```json
      "charger": { "entity": "switch.ipad_charger", "on_minutes": 120, "off_minutes": 120 }
      ```
      Watch the first day: if the battery runs low during the off time, shorten
      `off_minutes`.
- [ ] **"The iPad went quiet" alerts on your phone:** needs the Home Assistant
      app (its notify service), or an [ntfy](https://ntfy.sh) topic, which needs
      no smart home at all.
      ```json
      "watchdog": { "minutes": 15, "notify": "notify.mobile_app_your_phone", "ntfy": "" }
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
- [ ] **Calendar:** paste your Google Calendar's secret iCal address (Settings >
      your calendar > Secret address in iCal format).
      ```json
      "calendar": { "ics": ["https://calendar.google.com/calendar/ical/.../basic.ics"], "days": 3 }
      ```

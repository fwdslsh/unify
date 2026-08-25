---
title: "Telemetry"
description: "The Redpoll uplink payload byte by byte, the battery and tilt fields, and what a missing packet actually means."
---

# Telemetry

One uplink an hour, on port 2, eight bytes, little-endian throughout. It is deliberately
small enough to fit any fair-use policy on any network, and deliberately plain enough to
decode in a spreadsheet.

## The payload

```
byte 0-1   distance   uint16   millimetres from the transducer face
byte 2-3   level      int16    millimetres above datum, or 0x8000 if unset
byte 4     battery    uint8    hundredths of a volt above 2.50 V
byte 5     tilt       int8     degrees from level, signed
byte 6     samples    uint8    readings that agreed, out of 40
byte 7     flags      uint8    bit 0 low battery, bit 1 no echo, bit 2 reference unset
```

The `samples` byte is the one people ignore and should not. A healthy site sits between 34
and 40. A run of readings in the low twenties means the surface is broken — usually weed,
sometimes a new obstruction inside the cone — and the distance, while still a median, is
now a median of fewer opinions.

## Battery and tilt

Battery is reported as hundredths of a volt above 2.50&nbsp;V, so `151` is 4.01&nbsp;V. The
low-battery flag trips at 3.30&nbsp;V, which is about three weeks of warning in a British
December.

Tilt is signed degrees from level in the plane of the bracket. It changes when something
hits the bracket, so an alert on any change greater than two degrees is worth more than an
alert on the reading itself.

## Missing packets

A gap is not an outage. LoRaWAN uplinks are unconfirmed by default and a lost packet is
never retried; a site under a bridge deck will drop one hour in twenty and be entirely
healthy. Alert on **six consecutive** missed hours, not one, and read
[calibration](/docs/calibration.html) before you conclude a level is wrong — an unset
reference reports `0x8000` rather than a plausible-looking number, and that is the failure
mode you want.

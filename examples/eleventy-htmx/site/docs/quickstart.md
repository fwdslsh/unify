---
title: "Quickstart"
description: "Join a Redpoll to your gateway, hang it off the bracket, and read the first uplink — about twenty minutes on the bank."
---

# Quickstart

Everything below happens once, on the bank, with the enclosure open. Budget twenty minutes
and bring a 4&nbsp;mm hex key.

## 1. Wake the board

Slide the cell into the holder, positive end toward the panel connector. The status LED
blinks twice and then once every four seconds: the board is awake and looking for a
gateway. If it blinks continuously, the cell is below 3.2&nbsp;V and needs an hour on the
panel before it will join.

## 2. Join the gateway

Redpoll ships pre-provisioned for OTAA. The DevEUI is laser-etched inside the lid and
printed on the box; the AppKey came with the order confirmation. Register both with your
network server before you leave — the sensor retries a join every fifteen minutes and
otherwise sleeps, so a mis-typed key costs you a second trip rather than a battery.

A successful join is one long LED pulse, and the first uplink follows within a minute.

## 3. Mount the head

The bracket takes a 48&nbsp;mm scaffold tube or two M8 bolts through a parapet. Two rules
matter and nothing else does:

- the transducer face must be **level**, within about three degrees — the board reports its
  own tilt, so you can check this from the desk afterwards;
- there must be **no obstruction** inside a 30&nbsp;degree cone down to the water. A handrail
  edge or a bolt head inside the cone returns its own echo and pins the reading at a
  constant distance.

Hang the panel facing south with a clear sky above it, and dress the cable so no loop
collects water below the gland.

## 4. Read something

The first uplink carries a distance in millimetres from the transducer face to the water,
not a river level. Turning one into the other is [calibration](/docs/calibration.html), and
it is worth doing before you leave the site. The payload itself is described in
[telemetry](/docs/telemetry.html).

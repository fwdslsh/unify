---
title: "Calibration"
description: "Tie a Redpoll's distance reading to a staff gauge, store the offset on the board, and re-check it a season later."
---

# Calibration

A Redpoll measures the distance from its own face down to the water. A river level is that
distance subtracted from a fixed height above datum. Calibration is the act of writing that
fixed height onto the board, so every consumer downstream gets a level rather than a
distance.

## What you need

A staff gauge, or any mark whose height above datum you trust, and a serial console on the
maintenance port. Do it on a calm day: wind chop of ±20&nbsp;mm is normal and will make you
chase a number that was never still.

## The procedure

Read the staff gauge and the sensor at the same moment, then hand the board the difference:

```
> level 1.842
stored reference 1.842 m (was unset)
> read
distance 0.913 m   level 0.929 m   tilt 1.2°   battery 4.01 V
```

The reference is the height of the transducer face above datum, in metres. From firmware
2.6.0 it is stored on the board rather than in the gateway, so a head swapped out on the
bank keeps the site's calibration if you move the board across, and a replacement board
tells you plainly that its reference is unset instead of quietly reporting a level that is
out by the bracket height.

## Re-checking

Check against the gauge once a season, and always after anything touches the bracket. A
drift of more than 15&nbsp;mm that is not explained by silt or a bent bracket usually means
the transducer face has collected a film — a wipe with a damp cloth is the whole
maintenance schedule.

Do not calibrate against a flood peak. The reading is a median of forty samples and it is
honest, but a peak is exactly when the water surface is least like a mirror.

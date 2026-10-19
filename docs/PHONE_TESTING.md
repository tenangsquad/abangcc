# Testing ABANG CC: 2007 on a real phone

So far the game has only been run in desktop Chrome and Edge (real WebGL, but a software renderer in the automated
tests) and in *emulated* phone screens. Nobody has measured it on an actual phone GPU yet. This page is how to do that
in about 15 minutes, and what to send back.

## 1. Get the game onto the phone

**Easiest: one file.** Copy `dist/ABANG_CC_2007_ALPHA_12.html` to the phone (cloud drive, USB, email to yourself) and open it
in Chrome (Android) or Safari (iPhone). Note that some phones refuse to open local HTML files. If so, use option B.

**Option B: over Wi‑Fi from your PC** (phone and PC on the same network):

1. In this folder run `python -m http.server 8080` (or `npx serve .`).
2. Find the PC's address: `ipconfig` on Windows, look for "IPv4 Address", for example `192.168.1.23`.
3. On the phone open `http://192.168.1.23:8080/?fps`. If it does not load, Windows Firewall is probably blocking
   port 8080 for "Private networks": allow it when Windows asks.

Adding **`?fps`** to the address (or Settings → *Tunjuk FPS* → ON) shows a small green box in the bottom-left corner:

```
FPS 58 · terburuk 31 ms · bina 2.1 ms · high · 390×664@3
```

* **FPS**: frames per second over the last half second. 60 is perfect, 30 is playable, under 25 turns the box red.
* **terburuk**: the longest single frame in that window. Big spikes mean stutter.
* **bina**: milliseconds of JavaScript spent building the scene each frame.
* then the graphics quality, and the screen size @ pixel ratio.

**Tap the box** to copy a full performance report (device, GPU, average FPS, share of slow frames, quality). Paste it into a
message. On iPhone the copy button may be blocked, so in that case a toast shows instead; use the remote console (below).

## 2. What to play

Play one normal run for **3 to 5 days** and note:

| Check | Pass when |
|---|---|
| **Speed** | FPS stays above ~30 in a busy shop (day 4+, 6+ PCs, a full queue). If it drops, does the game switch itself to Sederhana / Rendah (a toast tells you)? |
| **Taps** | Every tap lands on the thing you meant: customers in the queue, PCs, the door crowd, the fuse box. No double actions. |
| **Pop-up menus** | The 30/60/90 and PC menus fit on screen above the sidebar, with buttons you can hit with a thumb. |
| **Double-tap** | Tapping a customer twice quickly seats them (⚡ Auto-duduk). |
| **Pinch / drag** | Two-finger pinch zooms the scene, one-finger drag pans it when zoomed. The page itself never scrolls or zooms. |
| **Rotate** | Portrait and landscape both work; turning the phone mid-game doesn't break anything. |
| **Sound** | Sound and music start after the first tap (iPhone is strict about this). Silent switch / volume behaves as expected. |
| **Switching apps** | Leaving the browser pauses the shift; coming back resumes it. |
| **Battery / heat** | After 10 minutes the phone is not too hot. |

## 3. What to send back

* The report from tapping the FPS box (or a screenshot of the box while the shop is busy).
* The phone model, OS and browser version.
* Anything that looked wrong, with a screenshot, and what you were doing.

## 4. If you want to look at the console

* **Android + Chrome:** enable USB debugging, plug into the PC, open `chrome://inspect` in desktop Chrome and *inspect* the page.
* **iPhone + Safari:** Settings → Safari → Advanced → Web Inspector ON, plug into a Mac, Safari → Develop → *your iPhone*.
* In the console, `ABCC.UI.perfReport()` prints the same report as the FPS box.

## What the automated tests cover (and don't)

`node --test tests/browser.test.mjs` includes a run with the CPU slowed down 6× on an emulated phone screen. It proves the game
keeps working, draws every frame it can and steps its graphics quality down when it is slow. It cannot tell you how a real
phone GPU performs: that is what this page is for.

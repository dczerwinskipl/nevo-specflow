---
id: product.specflow.ui.device-pairing
type: product
title: Device pairing and paired devices
status: draft
scope: specflow
areas: [ui, runtime, security]
tags: [pairing, owner-credential, devices, qr-code, headless, ask-agent]
read_when:
  - changing the screen a browser without an owner credential sees
  - changing how a paired device approves a pairing code, shows a QR code or lists its devices
  - changing how the UI explains that agents are paused while an initial pairing code exists
summary: >
  The UX contract of D21 device pairing (Ask agent contract): the Pair this device screen with the
  browser's own short code, where the request came from and the Runtime's initial code; approving a
  code or showing a QR code from a paired device; the headless initial code file; the paired-device
  list with Revoke. From the mock of 2026-11-20, not implemented.
related:
  - ideas.specflow-engine.reusable-workflow.agent-execution
  - product.specflow.ui.workflow-execution
  - product.specflow.ui.authentication-recovery
  - product.specflow.ui.interaction-model
---

# Device pairing and paired devices

**Status: UX contract from the mock of 2026-11-20, not implemented, awaiting owner review.** It
follows D21 of the [Ask agent contract](../../../ideas/specflow-engine/reusable-workflow-manual-execution/agent-assisted-execution.md#decisions):
every owner operation requires a per-device owner credential, in every authentication mode. The mock
is the Storybook set **SpecFlow/Screens/Device pairing (mock)**. Words in the UI: "pair", "paired
device", "pairing code"; never "credential", "cookie" or "token".

## Pair this device (a browser without the credential)

A standalone screen in the Login screen's shell (same brand header, language menu, one column):

- Title **Pair this device**; "Only a paired device can approve, finish or close work in SpecFlow on
  <Runtime name>. Pairing is done once per browser."
- **This device's pairing code**: the 8-character code in two groups of four ("K7QF-M2XD", read
  aloud by character), "Valid for 1:48 · works once", and "This device: <browser on OS> · from
  <address>" so the approving person can match it. When it expires the code is struck through,
  "This code expired. Codes work once, for about two minutes." and **New code**. A refused new code
  (rate limit) says when the next one can be asked for.
- **Approve it from a paired device**: three numbered steps (account menu, Pair a device, enter the
  code and check the device name, approve); "On a phone, you can instead choose Show QR code there
  and scan it with this phone's camera."
- **First device? Use SpecFlow's own code**: SpecFlow shows a one-time code in the window or
  terminal that started it; a **Code from SpecFlow** field and **Pair this device**. A wrong, used
  or replaced code is a field error that says which of those it can be and to check the code on the
  machine running SpecFlow. Too many tries disable the field and New code with "You can try again in
  <minutes>".
- **Headless SpecFlow, no device paired**: the screen leads with **Pair the first device**: no device
  is paired yet; this SpecFlow runs without a window to show a code in, so it saved a one-time code
  on the machine running it, readable only by the account that runs it; read it there, for example
  over SSH, and enter it here; "Until a device is paired, no agent starts." The page never shows the
  file's path (owner decision 2026-11-20).
- **Paired**: after approval, or on a phone after scanning a QR code, the requesting browser shows
  "This device is paired" ("This phone is paired"), who approved it (or that it was the QR code of
  <device>), a success alert "<device> · paired just now" with how to revoke it, and **Continue to
  SpecFlow**.

## On a paired device (account menu)

The account menu adds **Pair a device** and **Paired devices**. Both open dialogs over the current
screen (owner decision 2026-11-20; no settings page exists, and the list is short).

- **Pair a device**: "A paired device can approve, finish and close work. Pair only a device you are
  holding or can see." A segmented control: **Enter its code** (the field; once it matches a
  request, the request with its device and address and how long ago it was asked, the attention
  note "If you did not start this on a device of your own, do not approve it.", and **Pair <device>**;
  an expired code is a field error, "On the other device, choose New code and enter the new one
  here", and Pair is disabled) or **Show QR code** (a one-time QR code, "Scan it with the phone's
  camera. It works once, for 1:52 more.", **Done**).
- **Paired devices**: rows on the shared operational row (device glyph, "<browser> on <OS>", inline
  facts "This device" or "used <age>", "paired <date>", "from <address>") with **Revoke** each;
  footer **Close** and **Pair a device**. Revoke confirms:
  - another device: "Revoke <device>? It can no longer approve, finish or close anything until it is
    paired again. Work it already did stays.";
  - this device: "Revoke this device?", this browser then shows Pair this device until a paired
    device approves it again; the button reads **Revoke this device**;
  - the last paired device: "Revoke the last paired device?": no device will be paired, pairing
    again needs the machine running SpecFlow (restart it with `--pair` and use its code), and no agent
    starts until a device is paired.

## Agents cannot start while a code is waiting

While the initial code file exists, every agent start is refused. A paired device (possible after a
restart with `--pair`) learns it in the Ask agent dialog before starting, as described in
[Manual workflow execution, Ask agent](workflow-execution.md#ask-agent-dialog), with **Cancel the
pairing code** (owner decision 2026-11-20: a paired device may cancel a waiting code).

## Open questions

- The device name source (user agent) and whether the owner can rename a device.

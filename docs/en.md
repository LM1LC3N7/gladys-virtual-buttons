# Virtual buttons

Create your own buttons in Gladys, with a name, an icon and a colour, then
start a scene when you press them. No need to fake an MQTT device.

> Unofficial integration. **Tested with a fake Gladys only** (the automatic
> tests of the project), never yet on a real installation.

## The three types of button

| Type             | What it does                                                                                                                | Example                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Push button**  | One press = one pulse: it goes to 1, then back to 0 by itself one second later.                                             | "Start the movie scene" |
| **Switch**       | On / off, remembered (even after a restart).                                                                                | "Night mode"            |
| **Timed switch** | On, then back to off by itself after the chosen duration (1 to 1440 minutes). Pressing "on" again starts the duration over. | "Heating 30 min"        |

A button **controls nothing by itself**: a scene acts when it changes. The
button is the remote, the scene does the work.

## Step 1: create the button

1. In Gladys, open **Integrations**, then **Virtual buttons**, tab
   **Configuration**.
2. Click **Add a button**. A small form opens:
   - **Name**: for example `Heating` (up to 40 characters; the widget shows
     24);
   - **Type of button**: tick one of the three lines, each explained in one
     sentence. The type cannot be changed later;
   - **Duration in minutes**: for the timed switch only;
   - **Icon**: flame / heating, light bulb, shutter, plug, fan, music, movie,
     door, house, moon, sun, alarm, star…;
   - **Colour in the widget**: main (blue), secondary (grey) or danger (red);
   - **Ask for confirmation before pressing**: yes or no.
3. Confirm. The message under the button says `Button "Heating" added`.

## Step 2: add it in Gladys (Discovery tab)

Gladys does not let an integration create a device on its own: you approve it.

1. Open the **Discovery** tab of the integration. Your button is listed, with
   its name.
2. Click **Create** next to it. You may choose its room.
3. It now appears in the **Devices** tab. A push button is a "button" device, a
   switch a "switch" device.

## Step 3: the scene that acts

Example: "when I press Heating, turn on the plug of the heater".

1. Open **Scenes**, click **New scene**, give it a name and an icon (the
   flame, for example).
2. **Trigger**: choose **Device state change**. In the device list, pick your
   button ("Heating"). Set the condition to **equal to** and the value to
   **1**. Leave "Only when crossing the threshold" unticked: the scene then
   starts at every press.
3. **Action**: for example **Control a device**, choose the plug of the heater
   and "Turn on".
4. For a switch, make a second scene "when Heating changes to **0**" that
   turns the plug off. For a timed switch, this "changes to 0" scene also
   starts when the duration ends.
5. Save and enable the scene.

Never make a scene that sends a value **back to the button that started it**:
it would start again and again. The integration refuses a button used more
than 20 times in a minute, but better not to try.

## Step 4: the "Buttons" widget on the dashboard

1. Open your **dashboard**, switch to edit mode, add a box and choose the
   **Buttons** widget (of the Virtual buttons integration).
2. In its settings, choose **1 to 4 buttons** (Button 1 to Button 4). Only the
   buttons created at step 2 are listed.
3. The widget shows one pill per button, with the chosen icon, name and
   colour:
   - pressing a **push button** sends a pulse;
   - pressing a **switch** toggles it. On, it shows its colour (blue if you
     chose grey); off, it is grey;
   - for a **timed switch** that is on, a line shows the time left
     ("Heating: 25 min left");
   - if you asked for a **confirmation**, Gladys asks you to confirm before
     sending.
4. For more than 4 buttons, add several widgets.

The buttons also work in the usual Gladys boxes: the "Devices" box of a room,
and for the switches the "Quick actions" box. There, the icon is the Gladys one
(a circle for a button, a toggle for a switch): the icon you chose only shows in
the "Buttons" widget.

## Change or remove a button

- **Change a button**: pick the button in the list (or type its name if it is
  not created yet), then fill in only what changes: new name in the widget,
  icon, colour, confirmation, duration. The type does not change. A new
  duration applies at the next "on". A new name does not rename the Gladys
  device: rename it in the Devices tab too if you wish.
- **Remove a button**: pick it the same way. Then delete its device in the
  **Devices** tab if you had created it. If you only delete the device in
  Gladys, the button stays listed in Discovery.

## Safety: read this before controlling anything important

- **A virtual switch can be turned off (or on) by others than you**: a "turn
  everything off" command, the voice or the chat ("turn off Heating"), a
  connected assistant, any scene, any dashboard (even a wall screen). For a
  **sensitive command** (gate, alarm, boiler, garage door), **never use a
  switch**: use a **push button with confirmation**, and put the conditions in
  the scene (someone at home, time of day, alarm state…).
- **The state of the button is not the real state of the device it controls.**
  "Heating: on" means you pressed, not that the boiler is heating. If the scene
  fails or the device does not answer, the button does not know. To see the
  real state, add a real sensor (a plug that measures power, a thermometer) on
  your dashboard.
- The buttons are **never** declared as lights, so a "turn off the lights" never
  reaches them.
- If the container of the integration is stopped, a press fails (Gladys shows
  it). A timed switch whose duration ended while it was stopped goes back to
  off as soon as it starts again.

## The alternative without this integration: a scene in "Quick actions"

If all you need is **a button that starts a scene**, Gladys already does it,
without this integration and without a container:

1. Create the scene (for example "Heating 30 min") and pick its icon in the
   icon picker of the scene (the flame, for example).
2. On the dashboard, add the **Quick actions** box (or the **Scene** box), then
   add the scene with the label you like.
3. A press starts the scene, with its icon.

This integration is mostly useful when you need a **state**: an on/off switch
that is remembered, or a switch that goes back to off by itself after a
duration.

## Limits

- 100 buttons at most, 4 per widget (add several widgets).
- No long press nor double press, no free colour nor button size: only the
  three colours of the widget.
- The integration does not start scenes itself: the state change of the button
  starts them (step 3).
- The widget updates at every press, and otherwise every 15 to 30 seconds.
- Tested with a fake Gladys only: please report what does not work on the
  GitHub repository.

## Data

The list of the buttons, their state and the end of a timed switch are kept in
`/data/virtual-buttons.json`, the volume of the integration. Nothing leaves your
Gladys.

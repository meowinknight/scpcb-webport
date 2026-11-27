SCP - CONTAINMENT BREACH · WEB PORT  (real room / models / textures / sounds)
=============================================================================
Play:   needs to be served over HTTP (browsers block fetch() from file://)
          Windows:   double-click  start_server.bat
          Mac/Linux: ./start_server.sh      (or: python3 -m http.server 8000)
        then open  http://localhost:8000

What is real (taken unmodified, original file names and folders, from github.com/Regalis11/scpcb):
  GFX/map/173_opt.rmesh + 173_lm1/2.png + every texture it references   -> the room, loaded by an RMesh reader written from MapSystem.bb:LoadRMesh
  GFX/map/Props/*.x                                                      -> the room's prop models (monitors, lamps, chairs, ...)
  GFX/items/*.x / *.b3d (+ textures, INV*.jpg icons, doc173.jpg)          -> item models and inventory icons
  GFX/*.png                                                              -> HUD icons
  SFX/**/*.ogg                                                           -> footsteps, pick-up, heartbeat, breathing, gunshot, ambience
  Data/materials.ini                                                     -> footstep surface lookup
  manifest.json (generated)                                              -> lower-case -> real path table, because Blitz3D is case-insensitive and web servers are not

What is ported from the BlitzBasic source (js/game.js): MovePlayer (stamina, sprint, crouch, injuries, bloodloss, gravity),
MouseLook, blinking, items + 10-slot inventory, item use (first aid, vests, hazmat, gas mask, eyedrops, SCP-500, ...), Shoot() damage model,
LightVolume / fog from options.ini.  js/engine.js is a small WebGL2 engine (RMesh / DirectX .x incl. compressed / B3D readers, lightmapped
renderer, triangle-grid ellipsoid collision, WebAudio).

Controls: WASD move, Shift sprint, C crouch, Space blink, Tab inventory, click/E pick up, right-click/Q put away, H get shot, G god mode, R reset, F3 debug.
Touch: left thumb walk, right thumb look/tap to pick up, on-screen buttons.

LICENSE: SCP - Containment Breach is by Joonas Rikkonen (Regalis) / Undertow Games and contributors, licensed CC BY-SA 3.0.
This port is released under the same license (CC BY-SA 3.0) and is an unofficial fan port. Based on the work of the SCP Foundation community (scp-wiki.net).
See Credits.txt (from the repository) for the full credits.

TEST GUARD: walk into the chamber (past z=5) and the guard (GFX/npcs/guard.b3d) shouts and fires via the ported Shoot().

CONSOLE: press ` (backtick) or F4, or the CON button on touch. Type "help". Example: "guard off" / "guard on" / "guard toggle" / "guard reset" / "guard here".

DAMAGE FX: ported from Main.bb/NPCs.bb/Dreamfilter.bb - Shoot() one-frame camera jolt + LightVolume*1.2, feedback blur (BlurVolume), true camera roll, injury limp/zoom pulses, Kill() head-drop camera, death blur/fade. Not ported: muzzle-flash particle sprite.

DOORS: the six real CreateDoor calls of the 'start' room (MapSystem.bb), same positions, angles and open/locked states: containment door (open, big), 4 normal doors, one single-slab door. Two test changes: the west corridor door (10.6, 2.4) is a Level 3 keycard door with buttons, and the west end door (-2.5, 0.25) is unlocked. Console: door / door <n> open|close|toggle|lock|unlock.

MAP: 4-WAY ROOM
- A ROOM4 (rooms.ini [room4_2] = GFX/map/room4_2_opt.rmesh) sits one cell (RoomSpacing 8) NORTH of the start room (through the doorway in its north wall), origin (0,0,-8).
  Both rooms share one collision world, lighting list and renderer (engine: Eng.loadRoom(path,{x,z,yaw,into}) ).
- Doors follow CreateMap: ROOM4 always spawns all four boundary doors. The north one (start room <-> 4-way) is a normal unlocked door.
  The east/west/north ones lead to rooms that are not built yet, so I made them locked (only deviation; marked as such in the console 'door' list).
- Console: 'tp 0 8' style teleports work as before; 'door' lists/toggles all doors including the new ones.

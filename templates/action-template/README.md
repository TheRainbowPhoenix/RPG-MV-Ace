# Action Template

A ready-to-use action gameplay template for RPG Maker MV Ace. It includes a sample arena map, basic action controls, and a lightweight HUD so you can start prototyping real-time combat.

## What’s inside
- `data/Map001.json`: "Action Grounds" arena with wandering enemies, a healing pickup, and an in-world control guide.
- `js/plugins/ActionTemplate.js`: Plugin that enables melee attacks, dashing, a simple enemy AI loop, pickups, and an on-map HUD.
- `js/plugins.js`: Plugin configuration with the ActionTemplate plugin enabled.

## How to use
1. Copy the base engine template to a new project folder (for example `cp -r template my-action-game`).
2. Overlay the action template files onto that project: `cp -r templates/action-template/* my-action-game/`.
3. Open the project in RPG Maker MV (or run the shipped player) and start on "Action Grounds." The map is tagged with `<ActionTemplate>` so the plugin auto-activates.

## Controls
- **Attack**: Z / Enter / Space — hits the tile directly in front of the player.
- **Dash**: Shift — temporary speed boost with a cooldown.
- Enemies are any events named `[Enemy]` or `[Enemy:HP]` and deal contact damage.
- Pickups use `[Pickup:Heal]` naming and restore HP on touch.

Feel free to duplicate `Map001` and retheme it; the plugin will stay active on any map with `<ActionTemplate>` in its note box.

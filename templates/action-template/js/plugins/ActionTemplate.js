/*:
 * @plugindesc Simple action template controls for MV Ace demo map.
 * @author RPG-MV-Ace
 *
 * @help
 * Provides light-weight action gameplay for the Action Template map.
 * - Press OK (Z/Enter/Space) to attack the tile in front of the player.
 * - Hold Shift to dash briefly.
 * - Enemies are any events whose name starts with [Enemy] or [Enemy:HP].
 * - Pickups are events whose name starts with [Pickup].
 *
 * The plugin automatically enables itself on maps tagged with
 * <ActionTemplate> in the map note box. Use the provided Action Template
 * data files for an example configuration.
 */
(() => {
  const ATTACK_COOLDOWN = 20;
  const DASH_COOLDOWN = 60;
  const DASH_FRAMES = 20;
  const DASH_SPEED_BOOST = 2;

  const isActionTemplateMap = () => $gameMap && $gameMap.isActionTemplate && $gameMap.isActionTemplate();

  const parseEnemyData = (event) => {
    const match = event.event().name.match(/\[Enemy(?::(\d+))?\]/i);
    const hp = match && match[1] ? Number(match[1]) : 3;
    return { hp: Math.max(1, hp) };
  };

  const _Game_Map_setup = Game_Map.prototype.setup;
  Game_Map.prototype.setup = function(mapId) {
    this._isActionTemplate = false;
    _Game_Map_setup.call(this, mapId);
    const map = this.map();
    if (map) {
      DataManager.extractMetadata(map);
      this._isActionTemplate = !!map.meta.ActionTemplate;
    }
  };

  Game_Map.prototype.isActionTemplate = function() {
    return !!this._isActionTemplate;
  };

  const _sceneMapOnMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function() {
    _sceneMapOnMapLoaded.call(this);
    if (isActionTemplateMap()) {
      $gamePlayer.setActionSpawn($gamePlayer.x, $gamePlayer.y);
      $gamePlayer.resetActionTemplateStats();
      this.createActionHud();
    }
  };

  Scene_Map.prototype.createActionHud = function() {
    if (this._actionHud) return;
    this._actionHud = new Window_ActionHud(new Rectangle(0, 0, 360, 120));
    this.addWindow(this._actionHud);
  };

  const _sceneMapStart = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function() {
    _sceneMapStart.call(this);
    if (this._actionHud) {
      this._actionHud.openness = isActionTemplateMap() ? 255 : 0;
    }
  };

  const _sceneMapUpdate = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function() {
    _sceneMapUpdate.call(this);
    if (this._actionHud && isActionTemplateMap()) {
      this._actionHud.refresh();
    }
  };

  const _playerInitialize = Game_Player.prototype.initialize;
  Game_Player.prototype.initialize = function() {
    _playerInitialize.call(this);
    this.resetActionTemplateStats();
  };

  Game_Player.prototype.resetActionTemplateStats = function() {
    this._actionMaxHp = 5;
    this._actionHp = this._actionMaxHp;
    this._actionCooldown = 0;
    this._dashCooldown = 0;
    this._dashTimer = 0;
    this._actionInvuln = 0;
    this._actionBaseSpeed = this.moveSpeed();
    this._actionSpawn = this._actionSpawn || { mapId: $gameMap ? $gameMap.mapId() : 0, x: this.x, y: this.y };
  };

  Game_Player.prototype.setActionSpawn = function(x, y) {
    this._actionSpawn = { mapId: $gameMap.mapId(), x, y };
  };

  Game_Player.prototype.actionHudData = function() {
    return {
      hp: this._actionHp,
      maxHp: this._actionMaxHp,
      dash: this._dashCooldown,
      dashTimer: this._dashTimer,
      cooldown: this._actionCooldown
    };
  };

  const _playerUpdate = Game_Player.prototype.update;
  Game_Player.prototype.update = function(sceneActive) {
    _playerUpdate.call(this, sceneActive);
    if (!isActionTemplateMap()) return;
    this.updateActionTemplate(sceneActive);
  };

  Game_Player.prototype.updateActionTemplate = function(sceneActive) {
    if (!this._actionBaseSpeed) this._actionBaseSpeed = this.moveSpeed();

    if (this._actionCooldown > 0) this._actionCooldown--;
    if (this._dashCooldown > 0) this._dashCooldown--;
    if (this._actionInvuln > 0) this._actionInvuln--;
    if (this._dashTimer > 0) {
      this._dashTimer--;
      if (this._dashTimer === 0) this.setMoveSpeed(this._actionBaseSpeed);
    }

    if (!sceneActive) return;

    if (Input.isTriggered('ok')) {
      this.performActionAttack();
    }
    if (Input.isTriggered('dash')) {
      this.performActionDash();
    }
  };

  Game_Player.prototype.performActionDash = function() {
    if (this._dashCooldown > 0) return;
    this._dashCooldown = DASH_COOLDOWN;
    this._dashTimer = DASH_FRAMES;
    this.setMoveSpeed(this._actionBaseSpeed + DASH_SPEED_BOOST);
  };

  Game_Player.prototype.performActionAttack = function() {
    if (this._actionCooldown > 0) return;
    this._actionCooldown = ATTACK_COOLDOWN;
    const targetX = $gameMap.roundXWithDirection(this.x, this.direction());
    const targetY = $gameMap.roundYWithDirection(this.y, this.direction());
    const targets = $gameMap.eventsXy(targetX, targetY).filter(e => e.isActionEnemy());
    targets.forEach(event => event.takeActionDamage(1));
    if (targets.length === 0) {
      $gameTemp.requestAnimation([this], 7); // swing animation
    }
  };

  Game_Player.prototype.canTakeActionDamage = function() {
    return this._actionInvuln <= 0;
  };

  Game_Player.prototype.takeActionDamage = function(amount) {
    if (!this.canTakeActionDamage()) return;
    this._actionHp = Math.max(0, this._actionHp - amount);
    this._actionInvuln = 30;
    $gameTemp.requestAnimation([this], 4);
    if (this._actionHp <= 0) {
      this.respawnActionPlayer();
    }
  };

  Game_Player.prototype.healActionPlayer = function(amount) {
    this._actionHp = Math.min(this._actionMaxHp, this._actionHp + amount);
  };

  Game_Player.prototype.respawnActionPlayer = function() {
    const spawn = this._actionSpawn || { mapId: $gameMap.mapId(), x: this.x, y: this.y };
    this._actionHp = this._actionMaxHp;
    this.reserveTransfer(spawn.mapId, spawn.x, spawn.y, 2, 0);
  };

  const _eventInitialize = Game_Event.prototype.initialize;
  Game_Event.prototype.initialize = function(mapId, eventId) {
    _eventInitialize.call(this, mapId, eventId);
    this.setupActionTemplateData();
  };

  Game_Event.prototype.setupActionTemplateData = function() {
    this._actionData = null;
    if (this.isActionEnemy()) {
      const parsed = parseEnemyData(this);
      this._actionData = {
        type: 'enemy',
        hp: parsed.hp,
        maxHp: parsed.hp,
        cooldown: 0
      };
    } else if (this.isActionPickup()) {
      this._actionData = { type: 'pickup' };
    }
  };

  const _eventUpdate = Game_Event.prototype.update;
  Game_Event.prototype.update = function() {
    _eventUpdate.call(this);
    if (!isActionTemplateMap()) return;
    this.updateActionTemplate();
  };

  Game_Event.prototype.updateActionTemplate = function() {
    if (this.isActionEnemy()) {
      this.updateActionEnemy();
    } else if (this.isActionPickup()) {
      this.updateActionPickup();
    }
  };

  Game_Event.prototype.isActionEnemy = function() {
    return !!this.event().name.match(/\[Enemy/i);
  };

  Game_Event.prototype.isActionPickup = function() {
    return !!this.event().name.match(/\[Pickup/i);
  };

  Game_Event.prototype.takeActionDamage = function(amount) {
    if (!this._actionData || this._actionData.type !== 'enemy') return;
    this._actionData.hp = Math.max(0, this._actionData.hp - amount);
    $gameTemp.requestAnimation([this], 10);
    if (this._actionData.hp <= 0) {
      this.erase();
    }
  };

  Game_Event.prototype.updateActionEnemy = function() {
    if (!this._actionData) return;
    if (this._actionData.cooldown > 0) this._actionData.cooldown--;
    if (!this.isMoving() && this._actionData.cooldown <= 0) {
      this.moveTowardPlayer();
      this._actionData.cooldown = 20;
    }
    if (this.pos($gamePlayer.x, $gamePlayer.y)) {
      $gamePlayer.takeActionDamage(1);
      this._actionData.cooldown = 45;
    }
  };

  Game_Event.prototype.updateActionPickup = function() {
    if (this.pos($gamePlayer.x, $gamePlayer.y)) {
      const healMatch = this.event().name.match(/\[Pickup:(\w+)\]/i);
      if (healMatch && healMatch[1].toLowerCase() === 'heal') {
        $gamePlayer.healActionPlayer(2);
      }
      $gameTemp.requestAnimation([this], 39);
      this.erase();
    }
  };

  function Window_ActionHud(rect) {
    Window_Base.call(this, rect);
    this.opacity = 200;
    this.refresh();
  }

  Window_ActionHud.prototype = Object.create(Window_Base.prototype);
  Window_ActionHud.prototype.constructor = Window_ActionHud;

  Window_ActionHud.prototype.refresh = function() {
    if (!this.contents) return;
    this.contents.clear();
    const data = $gamePlayer.actionHudData();
    const lineHeight = this.lineHeight();
    this.drawText('Action Template', 0, 0, this.contentsWidth());
    this.drawGauge(0, lineHeight, this.contentsWidth(), data.hp / data.maxHp, this.textColor(20), this.textColor(21));
    this.drawText(`HP: ${data.hp}/${data.maxHp}`, 0, lineHeight, this.contentsWidth(), 'center');
    this.drawText(`Attack CD: ${Math.max(0, data.cooldown)}`, 0, lineHeight * 2, this.contentsWidth());
    this.drawText(`Dash CD: ${Math.max(0, data.dashCooldown)}`, 0, lineHeight * 3, this.contentsWidth());
  };
})();

import Phaser from 'phaser';

const WIDTH = 1280;
const HEIGHT = 720;
const FRAME_MS = 1000 / 60;
const PLAYER_SPEED = 500;
const PLAYER_HP = 20;
const PLAYER_HOLD_FIRE = 20 * FRAME_MS;
const PLAYER_TAP_FIRE = 5 * FRAME_MS;
const PLAYER_INVINCIBLE = 30 * FRAME_MS;
const ENEMY_SPEED = 300;
const ENEMY_FIRE = 90 * FRAME_MS;
const ENEMY_SPAWN = 60 * FRAME_MS;
const BOSS_SPAWN = 1200 * FRAME_MS;
const BOSS_PATTERN_SWITCH = 300 * FRAME_MS;
const BOSS_HP = 50;
const BOSS_ENTRY_DISTANCE = 300;
const BOSS_ENTRY_SPEED = 200;
const BULLET_SPEED = 1200;
const PLAYER_SHOT_SCORE = -2;
const PLAYER_DAMAGE_SCORE = -30;
const ENEMY_DEFEAT_SCORE = 60;
const BOSS_DEFEAT_SCORE = 500;
const BOMB_DAMAGE = 10;
const ITEM_SPEED = 120;
const STAR_DURATION = 180 * FRAME_MS;
const SCORE_BOOST_DURATION = 300 * FRAME_MS;
const MAX_BOMB_STOCK = 3;

type BossPattern = 'A' | 'B';
type ItemType = 'bomb' | 'star' | 'scoreBoost';
type PhysicsObject =
  | Phaser.Types.Physics.Arcade.GameObjectWithBody
  | Phaser.Physics.Arcade.Body
  | Phaser.Physics.Arcade.StaticBody
  | Phaser.Tilemaps.Tile;

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private items!: Phaser.Physics.Arcade.Group;
  private boss!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private space!: Phaser.Input.Keyboard.Key;
  private bombKey!: Phaser.Input.Keyboard.Key;
  private score = 0;
  private hp = PLAYER_HP;
  private lastShotAt = -Infinity;
  private invincibleUntil = 0;
  private bossHp = BOSS_HP;
  private bossActive = false;
  private bossAttacking = false;
  private bossPattern: BossPattern = 'A';
  private bossPatternStartedAt = 0;
  private bossDirection = 1;
  private ending = false;
  private enemySpawnTimer = 0;
  private elapsed = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private itemText!: Phaser.GameObjects.Text;
  private starGauge!: Phaser.GameObjects.Graphics;
  private scoreBoostGauge!: Phaser.GameObjects.Graphics;
  private bombStock = 0;
  private starUntil = 0;
  private scoreBoostUntil = 0;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.resetGameState();
    this.createTextures();
    this.cameras.main.setBackgroundColor('#08111f');
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.space = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.bombKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.input.keyboard!.on('keydown-SPACE', this.handleSpacePress, this);

    this.player = this.physics.add.sprite(120, HEIGHT / 2, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.body?.setSize(this.player.width, this.player.height);

    this.playerBullets = this.physics.add.group({ defaultKey: 'playerBullet', maxSize: 50, allowGravity: false });
    this.enemyBullets = this.physics.add.group({ defaultKey: 'enemyBullet', maxSize: 40, allowGravity: false });
    this.enemies = this.physics.add.group({ defaultKey: 'enemy', maxSize: 10, allowGravity: false });
    this.items = this.physics.add.group({ maxSize: 10, allowGravity: false });
    this.boss = this.physics.add.sprite(WIDTH + 100, HEIGHT / 2, 'boss');
    this.boss.setCollideWorldBounds(true);
    this.boss.setActive(false).setVisible(false);
    if (this.boss.body) this.boss.body.enable = false;

    this.physics.add.overlap(this.playerBullets, this.enemies, this.hitEnemy, undefined, this);
    this.physics.add.overlap(this.playerBullets, this.boss, this.hitBoss, () => this.bossAttacking, this);
    this.physics.add.overlap(this.enemyBullets, this.player, this.hitPlayer, undefined, this);
    this.physics.add.overlap(this.enemies, this.player, this.touchEnemy, undefined, this);
    this.physics.add.overlap(this.items, this.player, this.collectItem, undefined, this);

    this.scoreText = this.add.text(24, 20, '', this.hudStyle());
    this.hpText = this.add.text(24, 54, '', this.hudStyle());
    this.timeText = this.add.text(1060, 20, '', this.hudStyle());
    this.bossText = this.add.text(460, 20, '', this.hudStyle()).setColor('#ff8b94');
    this.itemText = this.add.text(24, 88, '', this.hudStyle()).setColor('#ffe29a');
    this.starGauge = this.add.graphics();
    this.scoreBoostGauge = this.add.graphics();
    this.updateHud();
  }

  private resetGameState(): void {
    this.score = 0;
    this.hp = PLAYER_HP;
    this.lastShotAt = -Infinity;
    this.invincibleUntil = 0;
    this.bossHp = BOSS_HP;
    this.bossActive = false;
    this.bossAttacking = false;
    this.bossPattern = 'A';
    this.bossPatternStartedAt = 0;
    this.bossDirection = 1;
    this.ending = false;
    this.enemySpawnTimer = 0;
    this.elapsed = 0;
    this.bombStock = 0;
    this.starUntil = 0;
    this.scoreBoostUntil = 0;
    this.lastBossShotAt = -Infinity;
  }

  update(_time: number, delta: number): void {
    if (this.ending) return;
    this.elapsed += delta;
    this.updatePlayer();
    this.updateHeldFire();
    if (Phaser.Input.Keyboard.JustDown(this.bombKey)) this.useBomb();
    this.updateEnemySpawn(delta);
    this.updateBoss(delta);
    this.cleanupOffscreen();
    const starActive = this.elapsed < this.starUntil;
    this.player.setTint(starActive ? 0xffffe8 : 0xffffff);
    this.player.setAlpha(starActive ? 0.65 : 1);
    this.updateHud();
  }

  private createTextures(): void {
    this.makeTexture('player', 63, 42, 0x7de3ff);
    this.makeTexture('enemy', 54, 54, 0xff5964);
    this.makeTexture('boss', 100, 130, 0xc77dff);
    this.makeTexture('playerBullet', 18, 6, 0xffd166);
    this.makeTexture('enemyBullet', 18, 6, 0xff8b94);
    this.makeTexture('itemBomb', 30, 30, 0xff9f43);
    this.makeTexture('itemStar', 30, 30, 0xfff1a8);
    this.makeTexture('itemScoreBoost', 30, 30, 0x7de3ff);
  }

  private makeTexture(key: string, width: number, height: number, color: number): void {
    if (this.textures.exists(key)) return;
    const graphics = this.add.graphics();
    graphics.fillStyle(color, 1).fillRect(0, 0, width, height);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }

  private hudStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: 'sans-serif', fontSize: '22px', color: '#d9e8ff' };
  }

  private updatePlayer(): void {
    const vertical = (this.cursors.down.isDown ? 1 : 0) - (this.cursors.up.isDown ? 1 : 0);
    this.player.setVelocityY(vertical * PLAYER_SPEED);
    this.player.setVelocityX(0);
  }

  private handleSpacePress(): void {
    if (this.elapsed - this.lastShotAt >= PLAYER_TAP_FIRE) this.firePlayerBullet();
  }

  private updateHeldFire(): void {
    if (this.space.isDown && this.elapsed - this.lastShotAt >= PLAYER_HOLD_FIRE) {
      this.firePlayerBullet();
    }
  }

  private firePlayerBullet(): void {
    const bullet = this.playerBullets.get(this.player.x + this.player.displayWidth / 2, this.player.y, 'playerBullet') as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet) return;
    bullet.enableBody(true, this.player.x + this.player.displayWidth / 2, this.player.y, true, true).setVelocityX(BULLET_SPEED);
    this.lastShotAt = this.elapsed;
    this.score += PLAYER_SHOT_SCORE;
  }

  private updateEnemySpawn(delta: number): void {
    if (this.bossActive) return;
    this.enemySpawnTimer += delta;
    if (this.enemySpawnTimer < ENEMY_SPAWN) return;
    this.enemySpawnTimer -= ENEMY_SPAWN;
    const enemyY = Phaser.Math.Between(60, HEIGHT - 60);
    const enemy = this.enemies.get(WIDTH + 30, enemyY) as Phaser.Physics.Arcade.Sprite | null;
    if (!enemy) return;
    enemy.enableBody(true, WIDTH + 30, enemyY, true, true).setData('hp', 2).setVelocityX(-ENEMY_SPEED);
    this.time.delayedCall(ENEMY_FIRE, () => this.fireEnemyBullet(enemy), undefined, this);
  }

  private fireEnemyBullet(source: Phaser.Physics.Arcade.Sprite): void {
    if (!source.active) return;
    if (source === this.boss) {
      this.fireBossSpread();
    } else {
      this.fireEnemyBulletFrom(source.x - source.displayWidth / 2, source.y);
    }
    if (source !== this.boss && source.active && !this.bossActive) {
      this.time.delayedCall(ENEMY_FIRE, () => this.fireEnemyBullet(source), undefined, this);
    }
  }

  private fireBossSpread(): void {
    const phaseTwo = this.bossHp <= 20;
    const bulletCount = phaseTwo ? 5 : 3;
    if (this.enemyBullets.getTotalFree() < bulletCount) return;
    const left = this.boss.x - this.boss.displayWidth / 2;
    const top = this.boss.y - this.boss.displayHeight / 2;
    const center = this.boss.y;
    const bottom = this.boss.y + this.boss.displayHeight / 2;
    const positions = phaseTwo
      ? [top, top + (center - top) / 2, center, center + (bottom - center) / 2, bottom]
      : [top, center, bottom];
    for (const y of positions) this.fireEnemyBulletFrom(left, y);
  }

  private fireEnemyBulletFrom(x: number, y: number): void {
    const bullet = this.enemyBullets.get(x, y) as Phaser.Physics.Arcade.Sprite | null;
    if (bullet) bullet.enableBody(true, x, y, true, true).setVelocityX(-BULLET_SPEED);
  }

  private updateBoss(delta: number): void {
    if (!this.bossActive && this.elapsed >= BOSS_SPAWN) {
      this.bossActive = true;
      this.bossDirection = Phaser.Math.RND.pick([-1, 1]);
      const startX = WIDTH + this.boss.displayWidth / 2;
      this.boss.enableBody(true, startX, HEIGHT / 2, true, true).setVelocityX(-BOSS_ENTRY_SPEED);
    }
    if (!this.bossActive) return;
    if (!this.bossAttacking) {
      const entryTargetX = WIDTH + this.boss.displayWidth / 2 - BOSS_ENTRY_DISTANCE;
      if (this.boss.x <= entryTargetX) {
        this.boss.setX(entryTargetX);
        this.boss.setVelocityX(0);
        this.bossAttacking = true;
        this.bossPatternStartedAt = this.elapsed;
        this.fireEnemyBullet(this.boss);
      }
      return;
    }
    const phaseTwo = this.bossHp <= 20;
    if (this.bossPattern === 'A') {
      const speed = phaseTwo ? 600 : 400;
      const halfHeight = this.boss.displayHeight / 2;
      const nextY = this.boss.y + this.bossDirection * speed * delta / 1000;
      if (nextY <= halfHeight) {
        this.boss.setY(halfHeight);
        this.bossDirection = 1;
      } else if (nextY >= HEIGHT - halfHeight) {
        this.boss.setY(HEIGHT - halfHeight);
        this.bossDirection = -1;
      } else {
        this.boss.setY(nextY);
      }
      this.boss.setVelocityY(0);
    } else {
      const difference = this.player.y - this.boss.y;
      this.boss.setVelocityY(Math.sign(difference) * (phaseTwo ? 270 : 230));
    }
    if (this.elapsed - this.bossPatternStartedAt >= BOSS_PATTERN_SWITCH) {
      this.bossPattern = this.bossPattern === 'A' ? 'B' : 'A';
      this.bossPatternStartedAt = this.elapsed;
    }
    const fireInterval = (phaseTwo ? 20 : 30) * FRAME_MS;
    if (this.elapsed - this.lastBossShotAt >= fireInterval) {
      this.fireEnemyBullet(this.boss);
      this.lastBossShotAt = this.elapsed;
    }
    void delta;
  }

  private lastBossShotAt = -Infinity;

  private hitEnemy(object1: PhysicsObject, object2: PhysicsObject): void {
    const first = this.toSprite(object1);
    const second = this.toSprite(object2);
    const bullet = first?.texture.key === 'playerBullet' ? first : second?.texture.key === 'playerBullet' ? second : null;
    const enemy = first?.texture.key === 'enemy' ? first : second?.texture.key === 'enemy' ? second : null;
    if (!bullet || !enemy) return;
    bullet.disableBody(true, true);
    const hp = (enemy.getData('hp') as number) - 1;
    if (hp <= 0) {
      this.createExplosion(enemy.x, enemy.y, 1);
      enemy.disableBody(true, true);
      this.awardDefeatScore(ENEMY_DEFEAT_SCORE);
      this.tryDropItem(enemy.x, enemy.y);
    } else {
      enemy.setData('hp', hp);
    }
  }

  private hitBoss(object1: PhysicsObject, object2: PhysicsObject): void {
    const first = this.toSprite(object1);
    const second = this.toSprite(object2);
    const bullet = first?.texture.key === 'playerBullet' ? first : second?.texture.key === 'playerBullet' ? second : null;
    if (!bullet) return;
    bullet.disableBody(true, true);
    this.damageBoss(1);
  }

  private hitPlayer(_player: PhysicsObject, object2: PhysicsObject): void {
    const bullet = this.toSprite(object2);
    if (!bullet) return;
    bullet.disableBody(true, true);
    if (this.elapsed < this.starUntil || this.elapsed < this.invincibleUntil) return;
    this.damagePlayer(1);
  }

  private touchEnemy(object1: PhysicsObject, object2: PhysicsObject): void {
    const first = this.toSprite(object1);
    const second = this.toSprite(object2);
    const enemy = first?.texture.key === 'enemy' ? first : second?.texture.key === 'enemy' ? second : null;
    if (this.elapsed < this.starUntil && enemy?.active) {
      this.createExplosion(enemy.x, enemy.y, 1);
      enemy.disableBody(true, true);
      this.awardDefeatScore(ENEMY_DEFEAT_SCORE);
      this.tryDropItem(enemy.x, enemy.y);
      return;
    }
    if (this.elapsed < this.invincibleUntil) return;
    this.damagePlayer(2);
  }

  private awardDefeatScore(points: number): void {
    this.score += this.elapsed < this.scoreBoostUntil ? points * 1.25 : points;
  }

  private tryDropItem(x: number, y: number): void {
    if (Phaser.Math.Between(0, 1) === 0) return;
    const itemType = Phaser.Math.RND.pick<ItemType>(['bomb', 'star', 'scoreBoost']);
    const textureKey = itemType === 'bomb' ? 'itemBomb' : itemType === 'star' ? 'itemStar' : 'itemScoreBoost';
    const item = this.items.get(x, y, textureKey) as Phaser.Physics.Arcade.Sprite | null;
    if (!item) return;
    item.setData('itemType', itemType);
    item.enableBody(true, x, y, true, true).setVelocityX(-ITEM_SPEED);
  }

  private collectItem(object1: PhysicsObject, object2: PhysicsObject): void {
    const first = this.toSprite(object1);
    const second = this.toSprite(object2);
    const item = first?.texture.key.startsWith('item') ? first : second?.texture.key.startsWith('item') ? second : null;
    if (!item) return;
    const itemType = item.getData('itemType') as ItemType;
    item.disableBody(true, true);
    if (itemType === 'bomb') {
      this.bombStock = Math.min(MAX_BOMB_STOCK, this.bombStock + 1);
    } else if (itemType === 'star') {
      this.starUntil = Math.max(this.starUntil, this.elapsed) + STAR_DURATION;
      this.invincibleUntil = Math.max(this.invincibleUntil, this.starUntil);
    } else {
      this.scoreBoostUntil = Math.max(this.scoreBoostUntil, this.elapsed) + SCORE_BOOST_DURATION;
    }
  }

  private useBomb(): void {
    if (this.bombStock <= 0) return;
    this.bombStock -= 1;
    for (const child of this.enemies.children) {
      if (!(child instanceof Phaser.Physics.Arcade.Sprite) || !child.active) continue;
      this.createExplosion(child.x, child.y, 1);
      child.disableBody(true, true);
      this.awardDefeatScore(ENEMY_DEFEAT_SCORE);
      this.tryDropItem(child.x, child.y);
    }
    if (this.bossActive && this.boss.active) this.damageBoss(BOMB_DAMAGE);
  }

  private damageBoss(amount: number): void {
    if (!this.boss.active || this.ending) return;
    this.bossHp -= amount;
    if (this.bossHp > 0) return;
    this.ending = true;
    this.createExplosion(this.boss.x, this.boss.y, 2.2, 1000);
    this.boss.disableBody(true, true);
    this.awardDefeatScore(BOSS_DEFEAT_SCORE);
    this.time.delayedCall(1000, () => this.finish(true), undefined, this);
  }

  private damagePlayer(amount: number): void {
    this.hp -= amount;
    this.score += PLAYER_DAMAGE_SCORE;
    this.invincibleUntil = this.elapsed + PLAYER_INVINCIBLE;
    this.player.setAlpha(0.45);
    this.time.delayedCall(PLAYER_INVINCIBLE, () => this.player.setAlpha(1), undefined, this);
    if (this.hp <= 0) this.finish(false);
  }

  private createExplosion(x: number, y: number, size: number, duration = 500): void {
    const effects: Phaser.GameObjects.GameObject[] = [];
    const flash = this.add.circle(x, y, 14 * size, 0xfff1a8);
    const ring = this.add.circle(x, y, 18 * size, 0xff7b54, 0.35);
    ring.setStrokeStyle(4 * size, 0xffd166, 1);
    effects.push(flash, ring);

    this.tweens.add({
      targets: flash,
      scale: 2.8,
      alpha: 0,
      duration: duration * 0.44,
      ease: 'Cubic.easeOut',
    });
    this.tweens.add({
      targets: ring,
      scale: 3.2,
      alpha: 0,
      duration: duration * 0.84,
      ease: 'Cubic.easeOut',
    });

    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      const distance = 34 * size;
      const spark = this.add.rectangle(x, y, 7 * size, 3 * size, index % 2 === 0 ? 0xffd166 : 0xff5964);
      spark.setOrigin(0.5).setRotation(angle);
      effects.push(spark);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.2,
        duration: duration * 0.72,
        ease: 'Cubic.easeOut',
      });
    }

    this.time.delayedCall(duration, () => {
      for (const effect of effects) effect.destroy();
    });
  }

  private cleanupOffscreen(): void {
    for (const child of this.playerBullets.children) {
      if (child instanceof Phaser.Physics.Arcade.Sprite) this.disableIfOutside(child, 0, WIDTH);
    }
    for (const child of this.enemyBullets.children) {
      if (child instanceof Phaser.Physics.Arcade.Sprite) this.disableIfOutside(child, 0, WIDTH);
    }
    for (const child of this.enemies.children) {
      if (child instanceof Phaser.Physics.Arcade.Sprite) this.disableEnemyIfOutside(child);
    }
    for (const child of this.items.children) {
      if (child instanceof Phaser.Physics.Arcade.Sprite) this.disableItemIfOutside(child);
    }
  }

  private disableIfOutside(object: Phaser.Physics.Arcade.Sprite, minX: number, maxX: number): boolean {
    const left = object.x - object.displayWidth / 2;
    const right = object.x + object.displayWidth / 2;
    if (object.active && (right < minX || left > maxX)) object.disableBody(true, true);
    return true;
  }

  private disableEnemyIfOutside(enemy: Phaser.Physics.Arcade.Sprite): void {
    const right = enemy.x + enemy.displayWidth / 2;
    if (enemy.active && right < 0) enemy.disableBody(true, true);
  }

  private disableItemIfOutside(item: Phaser.Physics.Arcade.Sprite): void {
    const left = item.x - item.displayWidth / 2;
    const right = item.x + item.displayWidth / 2;
    const top = item.y - item.displayHeight / 2;
    const bottom = item.y + item.displayHeight / 2;
    if (item.active && (right < 0 || left > WIDTH || bottom < 0 || top > HEIGHT)) {
      item.disableBody(true, true);
    }
  }

  private toSprite(object: PhysicsObject): Phaser.Physics.Arcade.Sprite | null {
    if (object instanceof Phaser.Physics.Arcade.Sprite) return object;
    if (object instanceof Phaser.Physics.Arcade.Body && object.gameObject instanceof Phaser.Physics.Arcade.Sprite) {
      return object.gameObject;
    }
    return null;
  }

  private updateHud(): void {
    this.scoreText.setText(`SCORE  ${this.score}`);
    this.hpText.setText(`HP  ${Math.max(0, this.hp)}/${PLAYER_HP}`);
    this.timeText.setText(`TIME  ${(this.elapsed / 1000).toFixed(1)}`);
    this.bossText.setText(this.bossActive ? `BOSS  ${Math.max(0, this.bossHp)}/${BOSS_HP}` : '');
    this.itemText.setText(`BOMB  ${this.bombStock}/${MAX_BOMB_STOCK}   STAR          SCORE x1.25`);
    this.updateItemGauges();
  }

  private updateItemGauges(): void {
    const starRatio = Phaser.Math.Clamp((this.starUntil - this.elapsed) / STAR_DURATION, 0, 1);
    const scoreBoostRatio = Phaser.Math.Clamp((this.scoreBoostUntil - this.elapsed) / SCORE_BOOST_DURATION, 0, 1);
    this.drawGauge(this.starGauge, 142, 122, 112, starRatio, 0xfff1a8);
    this.drawGauge(this.scoreBoostGauge, 360, 122, 112, scoreBoostRatio, 0x7de3ff);
  }

  private drawGauge(gauge: Phaser.GameObjects.Graphics, x: number, y: number, width: number, ratio: number, color: number): void {
    gauge.clear();
    gauge.setAlpha(0.7);
    gauge.fillStyle(0x26364d, 1).fillRect(x, y, width, 14);
    if (ratio > 0) gauge.fillStyle(color, 1).fillRect(x, y, width * ratio, 14);
    gauge.lineStyle(1, 0xd9e8ff, 0.7).strokeRect(x, y, width, 14);
  }

  private finish(cleared: boolean): void {
    this.scene.start('GameOverScene', { cleared, score: this.score });
  }
}
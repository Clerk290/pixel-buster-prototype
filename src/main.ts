import Phaser from 'phaser';
import './style.css';
import { loadProgress, saveProgress } from './supabase';

const app = document.querySelector('#app');

if (!app) {
  throw new Error('App root not found');
}

const shell = document.createElement('div');
shell.id = 'game-shell';

const hud = document.createElement('div');
hud.id = 'hud';

const saveBtn = document.createElement('button');
saveBtn.type = 'button';
saveBtn.textContent = 'Save';

const loadBtn = document.createElement('button');
loadBtn.type = 'button';
loadBtn.textContent = 'Load';

const status = document.createElement('div');
status.id = 'status';
status.textContent = 'Prototype ready';

hud.append(saveBtn, loadBtn, status);
shell.appendChild(hud);
app.appendChild(shell);

class PlayScene extends Phaser.Scene {
  player!: Phaser.Physics.Arcade.Sprite;
  platforms!: Phaser.Physics.Arcade.StaticGroup;
  enemies!: Phaser.Physics.Arcade.Group;
  projectiles!: Phaser.Physics.Arcade.Group;
  groundY = 450;
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  keys!: { shoot: Phaser.Input.Keyboard.Key; jump: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
  score = 0;
  health = 5;
  scoreText!: Phaser.GameObjects.Text;
  healthText!: Phaser.GameObjects.Text;
  statusText!: Phaser.GameObjects.Text;
  lastShot = 0;
  shotCooldown = 220;
  gameOver = false;

  constructor() {
    super('PlayScene');
  }

  preload() {
    // Simple generated textures instead of external asset files.
    this.textures.generate('player', {
      data: [
        '  1 1  ',
        ' 11111 ',
        ' 1 1 1 ',
        ' 11111 ',
        ' 1 1 1 ',
        ' 1 1 1 ',
        ' 11111 ',
      ],
      pixelWidth: 8,
      pixelHeight: 8,
    });

    this.textures.generate('enemy', {
      data: [
        ' 2222 ',
        '222222',
        '2 11 2',
        '222222',
        '2 11 2',
        ' 2222 ',
      ],
      pixelWidth: 8,
      pixelHeight: 8,
    });

    this.textures.generate('projectile', {
      data: ['11', '11'],
      pixelWidth: 8,
      pixelHeight: 8,
    });

    this.textures.generate('platform', {
      data: ['1111111111', '1111111111'],
      pixelWidth: 8,
      pixelHeight: 8,
    });
  }

  create() {
    this.cameras.main.setBackgroundColor('#0e1530');
    this.physics.world.setBounds(0, 0, 960, 540);

    this.platforms = this.physics.add.staticGroup();
    const ground = this.platforms.create(480, 500, 'platform');
    ground.setScale(120, 1).refreshBody();

    // floating platforms
    const ledge1 = this.platforms.create(250, 380, 'platform');
    ledge1.setScale(10, 1).refreshBody();

    const ledge2 = this.platforms.create(700, 330, 'platform');
    ledge2.setScale(10, 1).refreshBody();

    this.player = this.physics.add.sprite(120, 360, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0.05);
    this.player.setDepth(2);
    this.player.setScale(2);
    this.player.body.setSize(18, 32);

    this.projectiles = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: 20,
      allowGravity: false,
    });

    this.enemies = this.physics.add.group();
    const enemy1 = this.enemies.create(430, 450, 'enemy') as Phaser.Physics.Arcade.Sprite;
    enemy1.setCollideWorldBounds(true);
    enemy1.setBounce(0.2);
    enemy1.setScale(2);
    enemy1.setVelocityX(60);
    enemy1.setDepth(2);
    enemy1.body.setSize(26, 22);
    enemy1.setData('minX', 350);
    enemy1.setData('maxX', 680);
    enemy1.setData('speed', 60);
    enemy1.setData('facing', 1);

    const enemy2 = this.enemies.create(760, 290, 'enemy') as Phaser.Physics.Arcade.Sprite;
    enemy2.setCollideWorldBounds(true);
    enemy2.setBounce(0.2);
    enemy2.setScale(2);
    enemy2.setVelocityX(-80);
    enemy2.setDepth(2);
    enemy2.body.setSize(26, 22);
    enemy2.setData('minX', 600);
    enemy2.setData('maxX', 860);
    enemy2.setData('speed', 80);
    enemy2.setData('facing', -1);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      jump: Phaser.Input.Keyboard.KeyCodes.W,
      shoot: Phaser.Input.Keyboard.KeyCodes.J,
    }) as { shoot: Phaser.Input.Keyboard.Key; jump: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.collider(this.player, this.enemies, this.handlePlayerHit, undefined, this);
    this.physics.add.overlap(this.projectiles, this.enemies, this.handleProjectileHit, undefined, this);

    this.scoreText = this.add.text(20, 16, 'Score: 0', {
      fontSize: '22px',
      color: '#f5f7ff',
      fontFamily: 'monospace',
    });
    this.healthText = this.add.text(20, 42, 'HP: 5', {
      fontSize: '22px',
      color: '#ffd9d9',
      fontFamily: 'monospace',
    });
    this.statusText = this.add.text(20, 72, 'Stage 1', {
      fontSize: '18px',
      color: '#9dd0ff',
      fontFamily: 'monospace',
    });

    const resetButton = this.add.text(780, 18, 'Reset', {
      fontSize: '20px',
      color: '#fff2cf',
      backgroundColor: '#1a243f',
      padding: { x: 10, y: 8 },
    });
    resetButton.setInteractive();
    resetButton.on('pointerdown', () => this.resetRun());
  }

  update(time: number) {
    if (this.gameOver) {
      return;
    }

    const isLeft = this.cursors.left?.isDown || this.keys.left.isDown;
    const isRight = this.cursors.right?.isDown || this.keys.right.isDown;
    const jumpActive = Phaser.Input.Keyboard.JustDown(this.cursors.up!) || Phaser.Input.Keyboard.JustDown(this.keys.jump);
    const shootActive = Phaser.Input.Keyboard.JustDown(this.cursors.space!) || Phaser.Input.Keyboard.JustDown(this.keys.shoot);

    if (isLeft) {
      this.player.setVelocityX(-220);
      this.player.flipX = true;
    } else if (isRight) {
      this.player.setVelocityX(220);
      this.player.flipX = false;
    } else {
      this.player.setVelocityX(0);
    }

    if (jumpActive && this.player.body.touching.down) {
      this.player.setVelocityY(-430);
    }

    if (shootActive && time > this.lastShot + this.shotCooldown) {
      this.fireProjectile();
      this.lastShot = time;
    }

    this.enemies.children.iterate((enemyObj) => {
      const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
      const minX = enemy.getData('minX') as number;
      const maxX = enemy.getData('maxX') as number;
      let facing = enemy.getData('facing') as number;

      if (enemy.x <= minX) {
        facing = 1;
      }
      if (enemy.x >= maxX) {
        facing = -1;
      }

      enemy.setData('facing', facing);
      enemy.setVelocityX(facing * (enemy.getData('speed') as number));
      enemy.flipX = facing < 0;
    });

    this.updateHud();
  }

  fireProjectile() {
    const dir = this.player.flipX ? -1 : 1;
    const projectile = this.projectiles.get(this.player.x + dir * 18, this.player.y - 8, 'projectile') as Phaser.Physics.Arcade.Image;

    if (!projectile) {
      return;
    }

    projectile.setActive(true);
    projectile.setVisible(true);
    projectile.setScale(1.5);
    projectile.setVelocityX(dir * 420);
    projectile.setVelocityY(0);
    projectile.setBounce(0);
    projectile.setDepth(3);
    projectile.setCircle(4);
    projectile.setCollideWorldBounds(false);
    this.physics.world.on('worldbounds', (body: Phaser.Physics.Arcade.Body) => {
      if (body.gameObject === projectile) {
        projectile.destroy();
      }
    });
  }

  handleProjectileHit(projectile: Phaser.GameObjects.GameObject, enemy: Phaser.GameObjects.GameObject) {
    const bullet = projectile as Phaser.Physics.Arcade.Image;
    const target = enemy as Phaser.Physics.Arcade.Sprite;

    bullet.destroy();
    target.destroy();
    this.score += 100;
    this.statusText.setText('Enemy down!');
  }

  handlePlayerHit() {
    if (this.gameOver) {
      return;
    }

    this.health -= 1;
    this.player.setVelocity(-80, -180);
    this.player.setTint(0xff7d7d);
    this.time.delayedCall(180, () => this.player.clearTint());

    if (this.health <= 0) {
      this.gameOver = true;
      this.player.setVelocity(0, 0);
      this.statusText.setText('Game Over');
      this.healthText.setText('HP: 0');
      this.time.delayedCall(1000, () => this.resetRun());
    }
  }

  updateHud() {
    this.scoreText.setText(`Score: ${this.score}`);
    this.healthText.setText(`HP: ${this.health}`);
  }

  resetRun() {
    this.scene.restart();
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#0f1728',
  parent: shell,
  width: 960,
  height: 540,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 850 },
      debug: false,
    },
  },
  render: {
    antialias: false,
    pixelArt: true,
  },
  scene: [PlayScene],
});

const saveStatus = (message: string) => {
  status.textContent = message;
};

saveBtn.addEventListener('click', async () => {
  const snapshot = {
    score: game.scene.keys.PlayScene?.score ?? 0,
    health: game.scene.keys.PlayScene?.health ?? 5,
    stage: 'stage-1',
  };

  try {
    const result = await saveProgress(snapshot, 'slot-1');
    saveStatus(result.local ? 'Saved locally' : 'Saved to Supabase');
  } catch (error) {
    console.error(error);
    saveStatus('Save failed');
  }
});

loadBtn.addEventListener('click', async () => {
  try {
    const result = await loadProgress('slot-1');

    if (result) {
      const scene = game.scene.keys.PlayScene as PlayScene | undefined;
      if (scene) {
        scene.score = Number(result.score ?? 0);
        scene.health = Number(result.health ?? 5);
      }
      saveStatus('Progress loaded');
      return;
    }

    saveStatus('No save found');
  } catch (error) {
    console.error(error);
    saveStatus('Load failed');
  }
});

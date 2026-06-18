export type Vec2 = { x: number; y: number };

export type Particle = {
  pos: Vec2;
  vel: Vec2;
  char: string;
  color: string;
  ttl: number;
};

export type AttackAction = {
  kind: 'basic' | 'monster' | 'skill';
  phase: 'windup' | 'strike' | 'recovery';
  timer: number;
  duration: number;
  targetId?: string;
  skillIndex?: number;
  resolved: boolean;
};

export type SlashEffect = {
  from: Vec2;
  to: Vec2;
  color: string;
  char: string;
  ttl: number;
  maxTtl: number;
  style?: 'line' | 'arc' | 'lightning';
};

export type Rarity = '普通' | '精良' | '稀有' | '史诗' | '传说';
export type EquipSlot = 'weapon' | 'armor' | 'helmet' | 'necklace' | 'ring';
export type ItemType = 'equipment' | 'potion' | 'skillBook';

export type Stats = {
  maxHp: number;
  attack: number;
  defense: number;
  crit: number;
  lifeSteal: number;
};

/* ---- 词条系统 ---- */
export type AffixDef = {
  id: string;
  name: string;
  description: string;       // 用 {v} 作数值占位符
  minRarity: Rarity;
  weight: number;
};

export type Affix = {
  id: string;
  value: number;
};

export type EquipmentItem = {
  id: string;
  type: 'equipment';
  name: string;
  slot: EquipSlot;
  rarity: Rarity;
  level: number;
  stats: Partial<Stats>;
  affixes: Affix[];
  price: number;
};

export type PotionItem = {
  id: string;
  type: 'potion';
  name: string;
  heal: number;
  price: number;
};

export type SkillBookItem = {
  id: string;
  type: 'skillBook';
  name: string;
  skillId: string;
  price: number;
};

export type Item = EquipmentItem | PotionItem | SkillBookItem;

export type Skill = {
  id: string;
  name: string;
  cooldown: number;
  remaining: number;
  range: number;
  radius: number;
  multiplier: number;
  color: string;
  style?: 'line' | 'arc' | 'lightning';
};

/* ---- 技能/职业/天赋 定义 ---- */
export type SkillDef = {
  id: string;
  name: string;
  description: string;
  cooldown: number;
  range: number;
  radius: number;
  multiplier: number;
  color: string;
  style: 'line' | 'arc' | 'lightning';
  tier: number;
  requiredClass?: string;
  dropFrom?: MonsterKind[];
};

export type TalentEffect =
  | { kind: 'skill_boost'; skillId: string; stat: 'multiplier' | 'range' | 'cooldown'; value: number }
  | { kind: 'stat_boost'; stat: keyof Stats; value: number }
  | { kind: 'unlock_skill'; skillId: string };

export type TalentNode = {
  id: string;
  name: string;
  description: string;
  maxRank: number;
  requires?: string[];
  effect: TalentEffect;
};

export type ClassDef = {
  id: string;
  name: string;
  description: string;
  starterSkills: string[];
  talents: string[];
};

export type Player = {
  pos: Vec2;
  hp: number;
  level: number;
  exp: number;
  nextExp: number;
  gold: number;
  base: Stats;
  equipment: Partial<Record<EquipSlot, EquipmentItem>>;
  inventory: Item[];
  attackCooldown: number;
  facing: Vec2;
  action: AttackAction | null;
  alive: boolean;
  invincible: boolean;
  invTimer: number;
  playerClass?: string;
  talentPoints: number;
  talents: Record<string, number>;
  regenTimer: number;
};

export type MonsterKind = '稻草人' | '半兽人' | '骷髅战士' | '沃玛卫士' | '赤月恶魔';

export type Monster = {
  id: string;
  kind: MonsterKind;
  pos: Vec2;
  spawn: Vec2;
  level: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  exp: number;
  radius: number;
  speed: number;
  elite: boolean;
  boss: boolean;
  respawn: number;
  attackCooldown: number;
  vel: Vec2;
  facing: Vec2;
  action: AttackAction | null;
  hitstun: number;
  enraged?: boolean;
};

export type Drop = {
  id: string;
  pos: Vec2;
  item?: Item;
  gold?: number;
  ttl: number;
};

export type Zone = {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  level: number;
  color: string;
};

export type FloatingText = {
  text: string;
  pos: Vec2;
  color: string;
  ttl: number;
};

export type UiPanel = 'none' | 'bag' | 'shop' | 'itemDetail' | 'classSelect' | 'talents';

export type UiState = {
  panel: UiPanel;
  selectedIndex: number;
  scroll: number;
};

export type GameState = {
  player: Player;
  monsters: Monster[];
  drops: Drop[];
  skills: Skill[];
  floats: FloatingText[];
  message: string;
  messageTimer: number;
  time: number;
  camera: Vec2;
  shake: number;
  particles: Particle[];
  slashes: SlashEffect[];
  ui: UiState;
  showHelp: boolean;
};

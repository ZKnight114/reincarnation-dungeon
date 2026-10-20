export type EquipmentSlot = 'weapon' | 'armor' | 'accessory';
export type Quality = 'white' | 'green' | 'blue' | 'purple' | 'orange';
export type DamageType = 'physical' | 'magic' | 'true';
export type Profession = 'warrior' | 'mage' | 'rogue';
export type Branch =
  | 'neutral'
  | 'blade'
  | 'pole'
  | 'guard'
  | 'flame'
  | 'ice'
  | 'ward'
  | 'assassin'
  | 'archer'
  | 'leather';
export type ResonanceKey =
  | 'cleave'
  | 'iron_guard'
  | 'flurry'
  | 'second_wind'
  | 'bulwark'
  | 'warrior_mix'
  | 'ignite'
  | 'eruption'
  | 'frost'
  | 'mana_flow'
  | 'arcane_ward'
  | 'mage_mix'
  | 'venom'
  | 'ambush'
  | 'volley'
  | 'leech'
  | 'shadow_guard'
  | 'rogue_mix'
  | 'execution'
  | 'spear_storm'
  | 'fortress'
  | 'inferno'
  | 'blizzard'
  | 'archmage'
  | 'toxic_master'
  | 'rain_arrows'
  | 'shadow_master'
  | 'warrior_sword_base'
  | 'warrior_sword_edge'
  | 'warrior_sword_master'
  | 'warrior_spear_base'
  | 'warrior_spear_edge'
  | 'warrior_spear_master'
  | 'warrior_shield_base'
  | 'warrior_shield_edge'
  | 'warrior_shield_master'
  | 'mage_staff_base'
  | 'mage_staff_edge'
  | 'mage_staff_master'
  | 'mage_focus_base'
  | 'mage_focus_edge'
  | 'mage_focus_master'
  | 'mage_robe_base'
  | 'mage_robe_edge'
  | 'mage_robe_master'
  | 'rogue_knife_base'
  | 'rogue_knife_edge'
  | 'rogue_knife_master'
  | 'rogue_ranged_base'
  | 'rogue_ranged_edge'
  | 'rogue_ranged_master'
  | 'rogue_leather_base'
  | 'rogue_leather_edge'
  | 'rogue_leather_master';
export type Shape = 'dot' | 'domino' | 'I3' | 'L3' | 'L4' | 'O4' | 'I4' | 'Z5';
export interface Equipment {
  id: string;
  templateId: string;
  profession: Profession;
  name: string;
  artKind: string;
  slot: EquipmentSlot;
  quality: Quality;
  level: number;
  attack: number;
  hp: number;
  defense: number;
  damageType: DamageType;
  branch: Branch;
  potency: number;
  legacyCells?: [number, number][];
}
export interface Placement {
  id: string;
  x: number;
  y: number;
  rotation: number;
}
export interface Contribution {
  name: string;
  damage: number;
  healing: number;
  shield: number;
  triggers: number;
}
export interface CombatReport {
  event: number;
  seconds: number;
  rounds: number;
  won: boolean;
  reason: string;
  items: Record<string, Contribution>;
  /** Snapshot before victory recovery, so combat loss remains measurable. */
  lifeAtEnd?: number;
  recovery?: number;
}
export interface Effect {
  kind: 'poison' | 'burn' | 'chill';
  damage: number;
  remaining: number;
  timer: number;
  sourceId: string;
}
export interface Enemy {
  templateId?: string;
  profession?: Profession;
  name: string;
  species: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  isBoss: boolean;
  isElite: boolean;
  effects: Effect[];
}
export type EventKind =
  | 'battle'
  | 'elite'
  | 'boss'
  | 'treasure'
  | 'supply'
  | 'rest'
  | 'chance'
  | 'choice'
  | 'dig'
  | 'graduation'
  | 'promotion'
  | 'mentor'
  | 'ending';
export interface AdventureEvent {
  kind: EventKind;
  completed: boolean;
  variant: number;
}
export type TrialTier = 0 | 1 | 2;
export interface JourneyEntry {
  event: number;
  title: string;
  text: string;
  kind: 'story' | 'loot' | 'growth' | 'danger' | 'rest';
}
export interface HeroLoadout {
  equipment: Equipment[];
  placements: Placement[];
  capacity: number;
  packLayout?: 'legacy';
}
export type BuffKey = 'power' | 'tempo' | 'vitality' | 'defense';
export interface Reward {
  kind: 'buff' | 'resonance';
  title: string;
  buffs: BuffKey[];
  resonances: ResonanceKey[];
  /** One free replacement is shared by the three candidates. Absent on older saves. */
  refreshUsed?: boolean;
}
export type Outcome = 'win' | 'death' | 'retreat';
export type Rating = 'D' | 'C' | 'B' | 'A' | 'S';
export type Attribute = 'attack' | 'hp' | 'defense' | 'speed';
export type Attributes = Record<Attribute, number>;
export interface GuildBonus {
  attack: number;
  hp: number;
  defense: number;
  attackPercent: number;
  hpPercent: number;
  defensePercent: number;
  points: number;
}
export type TalentQuality = 'blue' | 'purple' | 'gold';
export type Aptitude = 'common' | 'gifted' | 'brilliant' | 'legendary';
export type TalentKey =
  | `${string}:${TalentQuality}`
  | 'born_fighter'
  | 'keen_focus'
  | 'battle_instinct'
  | 'hardy'
  | 'enduring'
  | 'robust'
  | 'iron_skin'
  | 'steady_guard'
  | 'tough_hide'
  | 'swift'
  | 'alert'
  | 'light_step';
export type Actor = 'hero' | 'enemy';
export interface HeroAppearance {
  version: 1;
  gender: 'male' | 'female';
  head: number;
  hair: number;
  torso: number;
  legs: number;
}
export interface Trainee {
  id: string;
  name: string;
  createdAt: number;
  profession: Profession;
  appearance?: HeroAppearance;
  recruitment: 'random' | 'targeted';
  talents: TalentKey[];
  aptitude?: Aptitude;
  allocation: Attributes;
  attributePoints?: number;
  guildBonus?: GuildBonus;
  realmStart?: number;
  tomeId?: string | null;
  tomeLevel?: number;
}
export interface HeroRecord extends Trainee {
  ratingVersion: 14 | 15;
  realm: number;
  guildAtGraduation: number;
  routeLength: number;
  normalLength: number;
  chapter: number;
  outcome: Outcome;
  completed: number;
  stages: number;
  power: number;
  rating: Rating;
  resonances: ResonanceKey[];
  resonanceTiers: Partial<Record<ResonanceKey, number>>;
  stats: { attack: number; hp: number; defense: number; speed: number; sustain: number };
  guildBaseline?: Attributes;
  score: { growth: number; build: number; performance: number };
  graduatedAt: number;
  loadout: HeroLoadout | null;
  trials: (TrialTier | null)[];
}
export interface RunSummary {
  medals?: number;
  legacyRewards?: boolean;
  outcome: Outcome;
  chapter: number;
  profession: Profession;
  completed: number;
  gold: number;
  kills: number;
  seconds: number;
  rounds: number;
  highestItem: number;
  links: number;
  reason: string;
  heroId: string;
}
export interface DigState {
  shovels: number;
  revealed: number[];
  equipment: Equipment[];
  placements: Placement[];
  claimed: string[];
}
export interface GameState {
  layoutRevision?: 1;
  rulesRevision?: number;
  footprintRevision?: number;
  version: 15;
  phase:
    | 'home'
    | 'chapter'
    | 'configure'
    | 'tome'
    | 'opening'
    | 'initial'
    | 'camp'
    | 'journey'
    | 'combat'
    | 'event'
    | 'awakening'
    | 'reward'
    | 'summary';
  meta: {
    expedition?: import('./expedition-types').ExpeditionState;
    medals: number;
    guildPurchased: number;
    guildHistory: { trained: number; trials: number; aRated: number; sRated: number };
    guildLevel: number;
    staminaSpent: number;
    tomes: Record<string, { level: number; pages: number }>;
    tomeGifts: Profession[];
    pendingPages: { heroId: string; choices: string[]; refreshed: boolean; extreme: boolean }[];
    gold: number;
    energy: { value: number; updatedAt: number };
    heroes: HeroRecord[];
    heroSerial: number;
    highestChapter: number;
    wins: number;
    runs: number;
    totalKills: number;
  };
  run: {
    routeRevision?: 16;
    prologue?: 'departure' | 'equipped' | 'resonance' | 'ready';
    resonanceNarration?: boolean;
    supply?: {
      power: number;
      threshold: number;
      result: 'low' | 'normal' | 'great';
      levels: number[];
      elapsed: number;
    };
    wheel?: { sector: number; paid: number; elapsed: number };
    packLayout?: 'legacy';
    profession: Profession;
    chapter: number;
    index: number;
    events: AdventureEvent[];
    points: number;
    buffs: Record<BuffKey, number>;
    rewards: Reward[];
    kills: number;
    seconds: number;
    rounds: number;
    highestItem: number;
    summary: RunSummary | null;
    starterRound: number;
    starterOffers: Equipment[];
    /** Pre-rolled template IDs for both supply rounds; never reroll on resume. */
    starterPlan?: string[][];
    /** Boss loot is being arranged; growth has not been applied yet. */
    pendingPromotion?: boolean;
    /** Promotion has advanced to a fresh node; choosing resonance resumes this same node. */
    resonanceAtNode?: boolean;
    resonances: ResonanceKey[];
    trainee: Trainee | null;
    stages: number;
    growth: { attack: number; hp: number; defense: number };
    lastLootIds: string[];
    trials: (TrialTier | null)[];
    journey: JourneyEntry[];
    eventGrowth: {
      attack: number;
      hp: number;
      defense: number;
      speed: number;
      hpPercent?: number;
      defensePercent?: number;
    };
    extreme: boolean;
    storyElapsed: number;
    autoExplore: boolean;
    dig: DigState | null;
    realm: number;
    peakStrength: number;
    encounter: Enemy | null;
    enemyHistory: Profession[];
    boundTome: { id: string; level: number } | null;
    legacyRoute?: boolean;
    legacyChapter?: boolean;
  };
  awakening: {
    stage: number;
    tier: TrialTier;
    attack: number;
    hp: number;
    defense: number;
    healed: number;
  } | null;
  player: { hp: number; maxHp: number; defense: number; shield: number };
  inventory: Equipment[];
  placements: Placement[];
  draft: Placement[];
  itemSerial: number;
  revision: number;
  combat: {
    /** Per-encounter presentation skip; skipCombat remains the hidden global switch. */
    skip?: boolean;
    stamina: number;
    mana: number;
    timers: Record<string, number>;
    heals: Record<string, number>;
    seconds: number;
    round: number;
    elapsed: number;
    order: Actor[];
    actionIndex: number;
    lastActor: Actor | null;
    bossTimer: number;
    minions: number;
    minionHp: number;
    hits: Record<string, number>;
    contributions: Record<string, Contribution>;
    counters: Record<string, number>;
    runtime: import('./skill-types').BattleRuntime | null;
  };
  skipCombat: boolean;
  enemy: Enemy | null;
  lastReport: CombatReport | null;
  log: { id: number; text: string; kind: 'system' | 'battle' | 'reward' }[];
  logSerial: number;
  isRunning: boolean;
  speed: 1 | 2 | 4;
  lastSaveTime: number;
}

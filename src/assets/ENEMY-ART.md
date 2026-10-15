# 敌人素材说明

2026-10-15，使用已绑定的 TapTap Maker 项目及服务默认模型生成九张怪物形象，参考本项目现有角色画风，统一朝左。未使用 OpenAI API 绘图。

- 小怪：`enemy-slime-full.png`、`enemy-bat-full.png`、`enemy-wolf-full.png`、`enemy-spider-full.png`、`enemy-wraith-full.png`。
- 精英／Boss：`enemy-ogre-full.png`、`enemy-golem-full.png`、`enemy-dragon-full.png`、`enemy-queen-full.png`。
- 成品均为256×256透明PNG。原始生成图与完整提示词保存在本地 `art-direction/enemies-v15/`，不进入网页发布产物。
- `scripts/prepare-enemies.py --source <原图目录>` 可重新处理九张 `guild_enemy_v15_<类型>_*.png`。需要 Python 和 Pillow。正常网页构建直接使用成品，不依赖此脚本、原图或 Maker 服务。

角色对应关系由 `src/pixel.ts` 的 `foeSprite` 管理；怪种、职业标签及投放规则位于 `src/enemies.ts`。目前仅分小怪与Boss，骷髅与白骨王复用原有素材。

---
name: generate-game-assets
description: "Use this skill whenever you need to generate game art assets for a project, including 8-direction character sheets and regular PNG props or environment assets. It covers generating raw images with request_thirdparty_ai_platform.sh, storing them under assets/generate-game-assets/${游戏名}/, removing magenta backgrounds, normalizing 8-direction sheets, and copying finalized assets into a specific game's assets directory."
license: Proprietary. LICENSE.txt has complete terms
---

# Generate Game Assets

这个 skill 用于生成游戏素材，分为两类：角色8方向图集、普通素材。

初始化生成的原始图片统一放在根目录：`assets/generate-game-assets/${游戏名}/`。

标准化或去背景完成后，再复制到具体游戏目录的资源目录，例如：`${游戏名}/assets/`。

## 角色8方向图集

默认方案：直接生成单张 8 向图集。

1. 使用同一个命令行先加载环境变量，再调用 `script/request_thirdparty_ai_platform.sh` 使用 `gpt-image-2` 生成图片。
2. 原始图片统一输出到：`assets/generate-game-assets/${游戏名}/`。
3. 提示词中明确要求：
   - 一张图里只有同一个角色
   - 必须是横向 8 格
   - 每格大小一致
   - 固定顺序为：`down, down-left, left, up-left, up, up-right, right, down-right`
   - 纯洋红背景 `#ff00ff`
4. 先使用 `remove_magenta_pngs.py` 去掉洋红背景。
5. 再使用 `normalize_generated_sheets.py`：
   - 按 8 帧切开整张图集
   - 每帧重新裁边
   - 再按统一比例放入固定 `256x256` 格子
   - 保证同一个角色所有方向显示尺寸一致
6. 标准化后的图片确认无误后，再复制到对应游戏目录，例如：`${游戏名}/assets/`。

### 提示词要求

- `EXACTLY 8 directional views`
- `one horizontal row`
- `equal spacing and equal size`
- `the SAME character`
- `solid pure magenta background #ff00ff`
- `Direction order from left to right must be: down, down-left, left, up-left, up, up-right, right, down-right`

### 8 向帧顺序

从左到右固定为：

1. down
2. down-left
3. left
4. up-left
5. up
6. up-right
7. right
8. down-right

### 命令示例

先生成原图：

```bash
source script/load_env.sh --file ./env.ini && script/request_thirdparty_ai_platform.sh image "<your prompt>" --format openai --model gpt-image-2 --size 1536x1024 --image-output "assets/generate-game-assets/${游戏名}/player-sheet.png"
```

先去掉洋红背景：

```bash
script/run_temp_script_with_deps.sh python --script remove_magenta_pngs.py --deps "pillow" --auto-clean assets/generate-game-assets/${游戏名}/player-sheet.png
```

再做 8 向图集标准化：

```bash
script/run_temp_script_with_deps.sh python --script normalize_generated_sheets.py --deps "pillow" --auto-clean assets/generate-game-assets/${游戏名}/player-sheet.png
```

支持一次传多个图片路径：

```bash
script/run_temp_script_with_deps.sh python --script remove_magenta_pngs.py --deps "pillow" --auto-clean assets/generate-game-assets/${游戏名}/player-sheet.png assets/generate-game-assets/${游戏名}/enemy-sheet.png ./other-sheet.png
script/run_temp_script_with_deps.sh python --script normalize_generated_sheets.py --deps "pillow" --auto-clean assets/generate-game-assets/${游戏名}/player-sheet.png assets/generate-game-assets/${游戏名}/enemy-sheet.png ./other-sheet.png
```

复制到游戏目录示例：

```bash
cp assets/generate-game-assets/${游戏名}/player-sheet.png ${游戏名}/assets/player-sheet.png
```

## 普通素材

1. 使用同一个命令行先加载环境变量，再调用 `script/request_thirdparty_ai_platform.sh` 使用 `gpt-image-2` 生成单张素材。
2. 原始图片统一输出到：`assets/generate-game-assets/${游戏名}/`。
3. 若素材带洋红背景，使用 `remove_magenta_pngs.py` 去背景。
4. 确认效果后，再复制到对应游戏目录，例如：`${游戏名}/assets/`。

### 命令示例

生成原图：

```bash
source script/load_env.sh --file ./env.ini && script/request_thirdparty_ai_platform.sh image "<your prompt>" --format openai --model gpt-image-2 --size 1024x1024 --image-output "assets/generate-game-assets/${游戏名}/tree.png"
```

去掉洋红背景：

```bash
script/run_temp_script_with_deps.sh python --script remove_magenta_pngs.py --deps "pillow" --auto-clean assets/generate-game-assets/${游戏名}/tree.png assets/generate-game-assets/${游戏名}/dagger.png
```

复制到游戏目录示例：

```bash
cp assets/generate-game-assets/${游戏名}/tree.png ${游戏名}/assets/tree.png
cp assets/generate-game-assets/${游戏名}/dagger.png ${游戏名}/assets/dagger.png
```

## 洋红去背景规则

`remove_magenta_pngs.py` 使用同一套洋红去背景逻辑：

- `r > 170`
- `b > 170`
- `g < 140`
- `min(r, b) - g > 70`

这样不仅能去掉纯 `#ff00ff`，也能去掉偏粉紫的背景残留。

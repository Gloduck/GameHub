---
name: generate-game-assets
description: "Use this skill whenever you need to generate game art assets for a project, including 8-direction character sheets, frame-by-frame sprite animations, and regular PNG props or environment assets. It covers generating raw images with request_thirdparty_ai_platform.sh, storing them under assets/generate-game-assets/${游戏名}/, removing magenta backgrounds, detecting frame borders when present, normalizing generated sheets, and copying finalized assets into a specific game's assets directory."
license: Proprietary. LICENSE.txt has complete terms
---

# Generate Game Assets

这个 skill 用于生成游戏素材，分为三类：角色8方向图集、逐帧 Sprite 动画、普通素材。

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

## 逐帧 Sprite 动画

默认方案：每个动作或特效单独生成一张横向条带图，再做离线预处理，前端只读取处理后的成品图。

### 核心原则

1. 每个动作或特效单独一张图，例如：`walk`、`run`、`jump`、`attack`、`dodge`、`flame-loop`、`explosion`。
2. 帧数不要写死，必须由用户或当前项目需求决定，例如 `4`、`6`、`8`、`10` 帧都可以。
3. 提示词里明确要求：`EXACTLY ${帧数} frames in one horizontal row`。
4. 建议使用：
   - 纯洋红背景：`#ff00ff`
   - 纯绿色识别边框：`#00ff00`
5. 每一帧都要有相同大小的绿色边框，主体必须完整处于边框内，不允许肢体或特效主体越界。
6. 后处理时优先按绿色边框切帧，不要只依赖平均切分。
7. 后处理必须做统一尺寸、底部对齐、水平居中，避免播放时忽大忽小或脚底抖动。

### 适用子类型

- 角色动作条带：例如横版 `walk / run / jump / attack / dodge`
- 俯视角角色条带：例如 `down-walk / up-walk / left-walk / right-walk`
- 特效条带：例如 `fire loop`、`explosion`、`hit spark`、`slash wave`
- UI 小动画：例如 `coin sparkle`、`button glow`

### 通用提示词要求

- `the SAME character`
- `EXACTLY ${帧数} frames`
- `one horizontal row`
- `equal spacing`
- `each frame enclosed by a thin bright green border rectangle #00ff00`
- `all green border boxes must have identical size`
- `character fully inside each green frame box`
- `do not let any body part cross the border`
- `solid pure magenta background #ff00ff`
- `no text, no UI, no extra objects`

如果是循环动画，例如 `walk`、`run`、`fire loop`，还要额外要求：

- `loop-ready cycle`
- `frame 1 and final frame should transition naturally`
- `consistent subject size and placement`
- `even motion rhythm`

如果是角色动作，还建议额外要求：

- `the SAME character`
- `consistent body size and foot placement`
- `character fully inside each green frame box`

如果是特效条带，还建议额外要求：

- `single isolated effect only`
- `keep the flame or effect centered in each frame`
- `consistent effect silhouette scale`
- `no environment, no props, no character`

### 生成命令示例

下面示例里 `${动作名}` 可以是 `walk`、`run`、`jump`、`attack`、`dodge`，`${帧数}` 由用户决定。

```bash
source script/load_env.sh --file ./env.ini && script/request_thirdparty_ai_platform.sh image "Pixel art side-view action game sprite sheet of the SAME character. EXACTLY ${帧数} frames in one horizontal row for the ${动作名} animation. Each frame must be enclosed by a thin bright green border rectangle #00ff00. All green border boxes must have identical size and be aligned in one row. Character fully inside each green frame box. Clean retro 2D action game style. Solid pure magenta background #ff00ff. No text, no UI, no extra objects." --format openai --model gpt-image-2 --size 1536x1024 --image-output "assets/generate-game-assets/${游戏名}/player-${动作名}-bordered.png"
```

火焰循环特效示例：

```bash
source script/load_env.sh --file ./env.ini && script/request_thirdparty_ai_platform.sh image "Pixel art flame loop sprite sheet. EXACTLY ${帧数} frames in one horizontal row. Each frame must be enclosed by a thin bright green border rectangle #00ff00. All green border boxes must have identical size and be aligned in one row. Single isolated flame effect only, centered in each frame, consistent silhouette scale, loop-ready cycle, frame 1 and final frame should transition naturally. Solid pure magenta background #ff00ff. No character, no props, no text, no UI." --format openai --model gpt-image-2 --size 1536x1024 --image-output "assets/generate-game-assets/${游戏名}/flame-loop-bordered.png"
```

爆炸特效示例：

```bash
source script/load_env.sh --file ./env.ini && script/request_thirdparty_ai_platform.sh image "Pixel art explosion sprite sheet. EXACTLY ${帧数} frames in one horizontal row. Each frame must be enclosed by a thin bright green border rectangle #00ff00. All green border boxes must have identical size and be aligned in one row. Single isolated explosion effect only, centered in each frame, consistent silhouette scale, from ignition to burst to fade. Solid pure magenta background #ff00ff. No character, no props, no text, no UI." --format openai --model gpt-image-2 --size 1536x1024 --image-output "assets/generate-game-assets/${游戏名}/explosion-bordered.png"
```

### 预处理流程

推荐使用项目内脚本或等价脚本，按以下顺序处理：

1. 去洋红背景。
2. 优先按绿色边框切帧。
3. 如果边框识别失败，再回退到等宽切分。
4. 每帧提取人物主体，剔除边缘噪点。
5. 统一主体缩放尺寸。
6. 放回固定大小格子，水平居中、底部对齐。
7. 输出为前端直接使用的成品条带图。

`free-world/preprocess_action_sheets.py` 就是一个可参考实现，支持：

- `--frames`：用户自定义当前动作帧数
- `--border-rgb`：边框颜色
- `--border-tolerance`：边框识别容差
- `--border-min-ratio`：边框线识别阈值
- `--output-width` / `--output-height`：统一输出格子大小

### 预处理命令示例

```bash
script/run_temp_script_with_deps.sh python --script free-world/preprocess_action_sheets.py --deps "pillow" --auto-clean assets/generate-game-assets/${游戏名}/player-${动作名}-bordered.png --frames ${帧数} --border-rgb "0,255,0" --border-tolerance 36 --border-min-ratio 0.6 --output-width 256 --output-height 320
```

如果脚本是“就地覆盖原图”的风格，后续再复制到游戏目录；如果脚本支持输出到新路径，也可以直接输出到 `${游戏名}/assets/`。

### 复制到游戏目录示例

```bash
cp assets/generate-game-assets/${游戏名}/player-${动作名}-bordered.png ${游戏名}/assets/player-${动作名}.png
cp assets/generate-game-assets/${游戏名}/flame-loop-bordered.png ${游戏名}/assets/flame-loop.png
cp assets/generate-game-assets/${游戏名}/explosion-bordered.png ${游戏名}/assets/explosion.png
```

### 重要约束

- 不要把动作帧数写死在 skill 里。
- 每次生成动作图时，都应该把 `${帧数}` 当作一个显式输入。
- 预处理脚本也必须接收 `${帧数}` 参数，不能默认假定永远是 `6`。
- 如果某个项目要统一 `8` 帧循环动作、`6` 帧攻击动作，就分别传对应帧数，不要混用硬编码。

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

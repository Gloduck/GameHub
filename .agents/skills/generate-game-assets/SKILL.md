---
name: generate-game-assets
description: 当用户想生成可直接用于游戏的图片素材时使用此 skill，包括透明背景素材、逐帧动画精灵表、GIF 预览图，以及对应的透明化处理和素材质量复审流程。
license: Proprietary. LICENSE.txt has complete terms
---

# 概述

## 依赖脚本

外部脚本：

+ `script/load_env.sh`
+ `script/request_thirdparty_ai_platform.sh`
+ `script/run_temp_script_with_deps.sh`

内部脚本：

+ `skills/generate-game-assets/chroma_key_transparent.py`
+ `skills/generate-game-assets/spritesheet_to_gif.py`

## 使用原则

+ 不优先依赖模型直接输出透明底，而是优先生成纯色抠图背景，再本地转透明。
+ 生成逐帧动画素材时，必须明确网格数量、格子大小一致、角色比例一致、角色对齐一致；除非动作本身明确包含位移，否则主体整体位置不得在帧间漂移。
+ 透明化完成后，如需质检，优先使用 `script/request_thirdparty_ai_platform.sh message` 配合合适的多模态分析模型进行复审。
+ GIF 只作为预览格式，正式素材优先保留透明 PNG 精灵表和透明 PNG 单帧。
+ 本 skill 内的 Python 脚本依赖 `Pillow`，执行时应优先通过 `script/run_temp_script_with_deps.sh` 运行，而不是直接执行 `python xxx.py`。
+ `script/run_temp_script_with_deps.sh` 支持使用 `--` 将后续参数原样透传给目标脚本。

## 模型推荐

+ 图片生成：优先使用支持图片生成的模型，例如 `gpt-image-2`。
+ 图片分析与质检：优先使用支持图片理解的模型，例如 `gpt-5.4`、`gpt-5.4-mini`。
+ 如果用户已经指定模型，则按用户要求执行。
+ 不要在流程示例中把模型选择写死为唯一可用方案，应根据当前平台可用模型和任务复杂度调整。

# 生成透明素材

## 推荐流程

+ 先执行 `source script/load_env.sh` 加载环境变量。
+ 使用 `script/request_thirdparty_ai_platform.sh image` 生成一张纯色抠图背景版本的素材图。
+ 背景色优先使用纯亮绿色 `RGB(0,255,0)` 或纯洋红色 `RGB(255,0,255)`。
+ 在提示词中明确要求该背景色不能出现在角色本体、特效、描边、阴影、高光中。
+ 使用 `skills/generate-game-assets/chroma_key_transparent.py` 将纯色背景转为透明 PNG。
+ 如果用户对边缘质量敏感，或者已经反馈有残边、误删、脏边问题，再用 `script/request_thirdparty_ai_platform.sh message` 配合合适的图片分析模型做复审。

## 提示词模板限制

+ 必须明确所有非主体像素都使用同一种纯色抠图背景。
+ 必须明确该背景色不能出现在角色本体、特效、描边、阴影、高光中。
+ 必须禁止文字、UI、水印、边框、额外场景背景。
+ 必须要求主体轮廓清晰，方便后续抠图。
+ 如果是像素风，必须额外强调像素风、轮廓清晰、可读性高。

提示词模板：

```text
生成一个 [风格] 的 [主体] 游戏素材。
所有非主体像素都必须使用纯亮绿色 RGB(0,255,0) 的纯色抠图背景。
角色本体、特效、描边、阴影、高光中都不能使用这种亮绿色。
不要文字、不要 UI、不要水印、不要边框、不要额外场景背景。
保持轮廓清晰，方便后续抠图。
```

## 流程示例

生成纯色底角色素材：

```bash
source script/load_env.sh && script/request_thirdparty_ai_platform.sh image "Create a chibi futuristic AI girl mascot in crisp anime pixel art. Use a completely flat solid chroma-key background color of pure lime green RGB(0,255,0) across every non-character pixel. Do not use this lime green anywhere on the character, effects, outlines, shading, or highlights. No text, no UI, no watermark, no border. Keep the silhouette clean and readable." --format openai --model <图片生成模型> --size 1024x1024 --image-output ./character-keyed.png
```

本地透明化：

```bash
script/run_temp_script_with_deps.sh python --script skills/generate-game-assets/chroma_key_transparent.py --deps "pillow" -- ./character-keyed.png ./character-transparent.png --method greenscreen --cleanup-bias 10 --min-alpha 8
```

透明化复审：

```bash
source script/load_env.sh && script/request_thirdparty_ai_platform.sh message "请检查这张透明化后的素材。重点检查：1）是否有残留背景像素或色边；2）是否误删了角色局部；3）是否存在脏的半透明边缘；4）是否存在会影响游戏使用的实际问题。如果没有明显问题，请严格输出：结论：没有明显问题。" --format openai --model <图片分析模型> --image ./character-transparent.png
```

# 生成逐帧动画素材

## 推荐流程

+ 先确定动作类型，例如待机、行走、攻击、施法。
+ 使用 `script/request_thirdparty_ai_platform.sh image` 生成严格网格的精灵表。
+ 在提示词中明确网格数量、格子大小一致、角色比例一致、角色对齐一致；除非动作本身明确包含位移，否则主体整体位置固定。
+ 明确要求所有格子组合起来是一套完整连贯的动作。
+ 先保留纯色底精灵表，再使用 `skills/generate-game-assets/chroma_key_transparent.py` 转透明。
+ 最后使用 `script/request_thirdparty_ai_platform.sh message` 配合合适的图片分析模型检查透明效果、帧对齐、裁切问题。

## 提示词模板限制

+ 必须明确网格数量，例如 `5x5`、`6x6` 或 `n x n`。
+ 必须明确每个格子等大，通常要求正方形格子。
+ 必须明确每格都是同一个角色，且比例一致、对齐一致。
+ 必须明确所有格子组合起来是一套完整连贯动作。
+ 除非动作本身明确包含位移（例如横向行走、冲刺、跳跃位移），否则必须明确要求主体锚点固定、整体不发生平移；局部变化只能来自肢体、特效或明暗变化。
+ 必须明确所有非角色像素统一使用纯色抠图背景。
+ 必须明确该背景色不能出现在角色本体、特效、描边、阴影、高光中。
+ 必须禁止文字、UI、水印、边框。
+ 如果是循环动作，必须明确要求动作适合循环播放。

提示词模板：

```text
生成一个 [风格] 的 N x N 游戏角色精灵表。
整张图必须是严格的 N x N 网格，共 N*N 个等大的正方形格子。
每个格子都显示同一个角色，角色比例和对齐必须完全一致，但每格对应一个不同动作帧。
所有格子组合起来要构成一套完整连贯的动作。
除非该动作被明确指定为带位移的动作，否则主体在所有格子中的底座锚点和整体位置必须固定，不能左右漂移、上下跳动或整件素材整体移动。
所有非角色像素必须使用纯亮绿色 RGB(0,255,0) 的纯色抠图背景。
角色本体、特效、描边、阴影、高光中都不能出现这种亮绿色。
不要文字、不要 UI、不要水印、不要边框。
角色在每一格中都应保持稳定居中，适合逐帧动画使用。
```

动作补充限制示例：

+ 待机：动作应为适合循环播放的轻微呼吸和眨眼待机动画。
+ 攻击：动作应包含完整攻击过程，包括起手、蓄力、挥出、收招。
+ 施法：动作应包含完整施法过程，包括蓄能、释放、冷却。
+ 行走：动作应为适合循环播放的完整行走动作。
+ 火焰/火炬/篝火等环境循环特效：应只表现火焰形状、亮度、局部摆动的变化，火炬杆、底座或主体锚点必须固定，不能整团火焰或整支火炬在画面内漂移。

## 流程示例

生成 5x5 精灵表：

```bash
source script/load_env.sh && script/request_thirdparty_ai_platform.sh image "Create a 5x5 sprite sheet for an AI character asset in anime pixel art style. The sheet must contain 25 equal-sized square cells arranged in a strict 5 by 5 grid. Each cell shows the same chibi futuristic AI girl mascot at the exact same scale and alignment, with a different frame of one coherent action sequence so that all 25 cells together form a complete motion set. Use a completely flat solid chroma-key background color of pure lime green RGB(0,255,0) across every non-character pixel in every cell. Do not use this lime green anywhere on the character, effects, outlines, shading, or highlights. No text, no UI, no border, no watermark. Crisp readable pixel art, centered in every frame, consistent proportions, suitable for frame-by-frame animation and later background removal." --format openai --model <图片生成模型> --size 1024x1024 --image-output ./spritesheet-keyed.png
```

精灵表透明化：

```bash
script/run_temp_script_with_deps.sh python --script skills/generate-game-assets/chroma_key_transparent.py --deps "pillow" -- ./spritesheet-keyed.png ./spritesheet-transparent.png --method greenscreen --cleanup-bias 10 --min-alpha 8
```

精灵表质量复审：

```bash
source script/load_env.sh && script/request_thirdparty_ai_platform.sh message "请检查这张 5x5 逐帧动画精灵表透明化后的结果。重点检查：1）是否有残留背景像素或色边；2）是否误删了角色局部；3）不同格子之间角色比例和对齐是否一致；4）是否有肢体或特效被裁切；5）是否存在会影响动画使用的实际问题。如果没有明显问题，请严格输出：结论：没有明显问题。" --format openai --model <图片分析模型> --image ./spritesheet-transparent.png
```

# 生成 GIF 动画素材

## 推荐流程

+ 先确保已经拿到一张透明背景的精灵表。
+ 使用 `skills/generate-game-assets/spritesheet_to_gif.py` 按网格拆分精灵表。
+ 脚本会同时导出透明 PNG 单帧和 GIF 预览图。
+ 如果原图尺寸不能被网格整除，脚本会自动居中裁切到可整除尺寸。
+ 如果 GIF 边缘太硬或太虚，可以调整 `--alpha-threshold`。
+ 如果用户要的是正式素材，优先交付透明 PNG 帧图，GIF 只作为预览。
+ 由于脚本依赖 `Pillow`，应通过 `script/run_temp_script_with_deps.sh` 执行。

## 提示词模板限制

+ GIF 不是直接通过提示词生成的，前提是先得到合格的透明精灵表。
+ 前置精灵表生成时，必须保证动作连贯、帧顺序清晰、网格规则明确。
+ 如果目标是循环 GIF，前置逐帧动作提示词中必须明确说明动作适合循环。
+ 因为 GIF 只有 1-bit 透明，所以前置精灵表应尽量保证轮廓清晰、边缘干净。
+ 这一部分的提示词模板直接复用“生成逐帧动画素材”章节中的模板。

## 流程示例

从透明精灵表生成 GIF：

```bash
script/run_temp_script_with_deps.sh python --script skills/generate-game-assets/spritesheet_to_gif.py --deps "pillow" -- ./spritesheet-transparent.png ./spritesheet-preview.gif --rows 5 --cols 5 --duration 80 --alpha-threshold 96 --frames-dir ./frames
```

使用其他网格：

```bash
script/run_temp_script_with_deps.sh python --script skills/generate-game-assets/spritesheet_to_gif.py --deps "pillow" -- ./spritesheet-transparent.png ./spritesheet-preview-6x6.gif --rows 6 --cols 6 --duration 80 --alpha-threshold 96 --frames-dir ./frames-6x6
script/run_temp_script_with_deps.sh python --script skills/generate-game-assets/spritesheet_to_gif.py --deps "pillow" -- ./spritesheet-transparent.png ./spritesheet-preview-4x7.gif --rows 4 --cols 7 --duration 80 --alpha-threshold 96 --frames-dir ./frames-4x7
```

生成待机循环 GIF 预览：

```bash
script/run_temp_script_with_deps.sh python --script skills/generate-game-assets/spritesheet_to_gif.py --deps "pillow" -- ./idle-transparent.png ./idle-preview.gif --rows 4 --cols 4 --duration 90 --alpha-threshold 96 --frames-dir ./idle-frames
```

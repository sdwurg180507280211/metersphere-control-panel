# Live2D 模型文件集说明

本目录包含 MeterSphere 项目看板娘使用的所有 Live2D Cubism 4 模型文件。

## 模型列表

| 目录名 | 角色名称 | 来源 | 特点 | 参数数量 |
|--------|----------|------|------|----------|
| fuxuan | 符玄 | 崩坏：星穹铁道 | 大量自定义参数，七星盘特效 | 244 |
| kafka | 卡芙卡 | 崩坏：星穹铁道 | 精致的模型 | 203 |
| jingliu | 镜流 | 崩坏：星穹铁道 | 带眼罩切换表情 | 142 |
| robin | 知更鸟 | 崩坏：星穹铁道 | 多道具切换（麦克风、酒杯） | 116 |
| huohuo | 藿藿 | 崩坏：星穹铁道 | 多个动画和表情 | 155 |
| jian | 简 | 原创 | 丰富表情系统 | 236 |
| yangyang | 秧秧 | 原创 | 多动画 | 182 |
| rice | Rice | 原创 | 简单基础模型 | 96 |
| nicole | Nicole | 原创 | 多手势和表情 | 88 |

---

## 文件格式说明

### Cubism 4 核心文件格式

| 扩展名 | 文件名格式 | 说明 |
|--------|------------|------|
| `.model3.json` | `{name}.model3.json` | **模型主配置文件**，入口文件，包含所有资源引用 |
| `.moc3` | `{name}.moc3` | **模型核心数据文件**，二进制格式，包含网格、变形器、参数定义 |
| `.cdi3.json` | `{name}.cdi3.json` | **参数显示信息文件**，包含参数ID、中文名、分组信息 |
| `.physics3.json` | `{name}.physics3.json` | **物理模拟配置**，头发、衣服等摆动效果 |

### 纹理文件

| 目录 | 说明 |
|------|------|
| `{name}.4096/` | 4096x4096 分辨率纹理集 |
| `{name}.8192/` | 8192x8192 分辨率纹理集 |
| `{name}.2048/` | 2048x2048 分辨率纹理集 |
| `texture_XX.png` | 纹理图片，按索引编号 |

### 动画与表情文件

| 扩展名 | 说明 |
|--------|------|
| `.motion3.json` | 动作动画文件（待机动画、特殊动作等） |
| `.exp3.json` | 表情文件（切换表情、道具显隐等） |

### 第三方工具配置

| 文件名 | 说明 |
|--------|------|
| `*.vtube.json` | VTube Studio 配置文件，包含追踪参数映射、热键设置 |
| `items_pinned_to_model.json` | VTube Studio 道具固定配置 |
| `使用说明（用前请看）.txt` | 原作者说明文档 |
| `按键.txt` | 表情/动作快捷键说明 |
| `*.png` | 模型预览图 |

---

## 详细目录结构

### fuxuan/ - 符玄模型
```
fuxuan/
├── 符玄.model3.json          # 主配置，引用所有资源
├── 符玄.moc3                  # 模型核心数据
├── 符玄.cdi3.json             # 参数定义（244 个参数）
├── 符玄.physics3.json         # 物理配置
├── 符玄.vtube.json            # VTube Studio 配置
├── 符玄.4096/                 # 纹理目录
│   ├── texture_00.png ~ texture_07.png  # 8 张纹理图
├── items_pinned_to_model.json
└── 使用说明（用前请看）.txt
```

**符玄特色参数（cdi3.json 中定义）：**
- `ParamGroup20` - 中间：外蒙版、外紫环转、外紫环显隐、外紫环大小、中蒙版、中紫环转、中紫环显隐、中紫环大小、...
- `ParamGroup21` - 组：外紫环转、中紫环转、内紫环转、外黄环转、内黄环转、1.1、1.2、1.3、...
- `ParamGroup19` - 镜头：黑幕切换、黑幕透明显现、白色透明x、白色透明y、眼镜发光、白圈不透明度、白圈大小、白圈位移x、...
- `ParamGroup17` - 右手基础：右手基础切换、右手上臂旋转、右手基础上壁透视、右手基础上壁透视2、右手基础上臂旋转、右手基础下壁透视、透视2、右手基础图层顺序、...
- `ParamGroup16` - 右手指：右手切换、右手指Z、右手指手指、右手指手指2、右手指手指3、右手指手指4、右手指手指5
- `ParamGroup10` - 按键：黑脸、生气、爱心、钱、泪眼
- `ParamGroup8` - 兽耳：颈饰3x、颈饰3y、颈饰2x、颈饰2y、颈饰1x、颈饰1y、衣服左饰、左环2、...
- `ParamGroup4` - 左丝带：[0]左丝带、[1]左丝带、[2]左丝带、[3]左丝带、[4]左丝带、[5]左丝带、[6]左丝带
- `ParamGroup12` - 右丝带：[0]右丝带、[1]右丝带、[2]右丝带、[3]右丝带、[4]右丝带、[5]右丝带、[6]右丝带
- `ParamGroup2` - eye：左眼开闭、左眼微笑、右眼开闭、右眼微笑、眼珠X、眼珠Y、眼球物理RX、眼球物理RY、...
- `ParamGroup3` - mouse：嘴变形、嘴张开和闭合、眯眼瞪眼R、眯眼瞪眼L、嘴变形联动、下颌开闭
- `ParamGroup6` - 眉毛：右眉上下、右眉左右、右眉变形、右眉角度、左眉上下、左眉左右、左眉变形、左眉角度
- `ParamGroup5` - body：身体旋转X、身体旋转Y、身体旋转Z、bodyX2、bodyY2、bodyZ2、腿、bodyX动画用上半身、...
- 标准参数：星显隐、星大小、外围星变大、外星出现

### kafka/ - 卡芙卡模型
```
kafka/
├── kafuka1.model3.json
├── kafuka1.moc3
├── kafuka1.cdi3.json             # 参数定义（203 个参数）
├── kafuka1.physics3.json
├── kafuka1.vtube.json
├── kafuka1.8192/
│   ├── texture_00.png ~ texture_02.png
└── items_pinned_to_model.json
```

**卡芙卡特色参数（cdi3.json 中定义）：**
- `ParamGroup25` - 前刘海：前刘海c、前刘海cy、前刘海b、前刘海by、前刘海a、前刘海ay、前刘海2C、前刘海2cy、...
- `ParamGroup27` - 侧长发：侧长发d、侧长发dy、侧长发c、侧长发cy、侧长发b、侧长发by、侧长发a、侧长发ay
- `ParamGroup26` - 侧发：侧发d、侧发dy、侧发c、侧发cy、侧发b、侧发by、侧发a、侧发ay
- `ParamGroup10` - 胸：胸x、胸xx、胸y、胸yy
- `ParamGroup22` - 外套物理：外套物理X1、外套物理Y1、外套物理X2、外套物理Y2、外套物理X3、外套物理Y3、外套补充物理
- `ParamGroup16` - 丝巾物理：丝巾物理1、丝巾物理2、丝巾物理补充1、丝巾物理补充a1、丝巾物理补充a2、丝巾物理补充b1、丝巾物理补充b2、丝巾物理补充c1
- `ParamGroup15` - 熊物理：熊物理X、熊物理Z、熊物理Y、熊2物理X、熊2物理Z、熊2物理Y
- `ParamGroup19` - 手物理：手物理1、手物理2、手物理3、手物理4、手物理5
- `ParamGroup20` - 手物理右：右手物理1、右手物理2、右手物理3、右手物理4、右手物理5
- `ParamGroup21` - 袖口花边物理：袖口花边物理、袖口花边物Y、袖口花边物理a、袖口花边物理aY、袖口花边物理b、袖口花边物理bY
- `ParamGroup23` - 靴子物理：靴子物理X、靴子物理Y、靴子物理X1、靴子物理Y1、拉链
- `ParamGroup14` - 衣领物理：衣领物理1、衣领物理2、右衣领物理1、右衣领物理2、外套衣领物理1、外套衣领物理2、右外套衣领物理1、右外套衣领物理2、...
- `ParamGroup13` - 耳坠：[0]耳坠、[1]耳坠、[2]耳坠、[3]耳坠、[4]耳坠、[5]耳坠、[6]耳坠
- `ParamGroup2` - 表情：左眼开闭、左眼微笑、右眼开闭、右眼微笑、眼珠X、眼珠Y、左眉上下、左眉变形、...
- `ParamGroup4` - 左眼物理：眼线物理、睫毛物理1、睫毛物理2、左眼珠物理X、左眼珠物理Y、左眼瞳X、左眼瞳Y、左高光物理X、...
- `ParamGroup5` - 右眼物理：右眼线物理、右睫毛物理1、右眼珠物理X、右眼珠物理Y、右眼瞳X、右眼瞳Y、右高光物理X、右高光物理Y、...
- `ParamGroup7` - 前发物理：前发物理1、前发物理2、前发物理3、前发物理4、头发Y、头发Y2、头发Y3
- `ParamGroup8` - 垂发右1：垂发右补充、[0]垂发右1、[1]垂发右1、[2]垂发右1、[3]垂发右1、[4]垂发右1、[5]垂发右1、[6]垂发右1、...
- `ParamGroup9` - 垂发左1：垂发左补充、[0]垂发左1、[1]垂发左1、[2]垂发左1、[3]垂发左1、[4]垂发左1、[5]垂发左1、[6]垂发左1、...
- 标准参数：呼吸、摇动前发、摇动侧发、摇动后发

### jingliu/ - 镜流模型
```
jingliu/
├── 镜流.model3.json
├── 镜流.moc3
├── 镜流.cdi3.json             # 参数定义（142 个参数）
├── 镜流.physics3.json
├── 镜流.vtube.json
├── 镜流.8192/
│   └── texture_00.png
├── 眼罩.exp3.json              # 眼罩切换表情
└── items_pinned_to_model.json
```

**镜流特色参数（cdi3.json 中定义）：**
- `ParamGroup13` - 按键：眼罩
- `ParamGroup15` - 腿：身体上下、R 斜度、R 大腿抬起、R 小腿、R 小腿旋转、R腿 脚、R脚 旋转、L 大腿、L大腿 旋转、L小腿、...
- `ParamGroup6` - 花花：花花b、花花by、花花ay、花花a
- `ParamGroup14` - EYE：EYE B、EYE A、EYE R、EYE R A
- `ParamGroup12` - 手臂后带子：手臂后带子d、手臂后带子dy、手臂后带子c、手臂后带子cy、手臂后带子b、手臂后带子by、手臂后带子a、手臂后带子ay
- `ParamGroup10` - 裙子 2：裙子 2c、裙子 2cy、裙子 2b、裙子 2by、裙子 2a、裙子 2ay
- `ParamGroup9` - 流苏：流苏c、流苏cy、流苏b、流苏by、流苏a、流苏ay
- `ParamGroup8` - 裙子：裙子d、裙子dy、裙子c、裙子cy、裙子b、裙子by、裙子a、裙子ay
- `ParamGroup11` - 三段飘带：三段飘带c、三段飘带cy、三段飘带b、三段飘带by、三段飘带a、三段飘带ay
- `ParamGroup7` - 手：手c、手c、手cy、手b、手b、手BY、手a、手a、手、手
- `ParamGroup5` - 老物理：后发d、后发dy、后发c、后发cy、后发b、后发by、后发a、后发ay、长侧发d、长侧发dy、...
- `ParamGroup` - 五官类：左眼　开闭、左眼　微笑、右眼、右眼　微笑、眼珠 X、眼珠 Y、左眉上下、左眉　角度、左眉联动 上下、左眉联动 角度下、...
- `ParamGroup3` - 刘海：刘海c、刘海cy、刘海b、刘海by、刘海a、刘海ay
- `ParamGroup4` - 侧发：侧发c、侧发cy、侧发b、侧发by、侧发a、侧发ay
- `ParamGroup2` - 九轴类：角度 X、角度 Y、角度 Z、X、Y、Z、脸颊泛红、手臂xy、身体旋转　X、身体旋转　Y、...
- 标准参数：呼吸、吊坠5、吊坠4、吊坠3、吊坠2、吊坠1

### robin/ - 知更鸟模型
```
robin/
├── 知更鸟.model3.json
├── 知更鸟.moc3
├── 知更鸟.cdi3.json             # 参数定义（116 个参数）
├── 知更鸟.physics3.json
├── 知更鸟.vtube.json
├── 知更鸟.8192/
│   ├── texture_00.png ~ texture_01.png
├── 麦克风.exp3.json           # 麦克风道具
├── 拿酒杯.exp3.json           # 酒杯道具
├── 捂胸.exp3.json             # 捂胸表情
└── items_pinned_to_model.json
```

**知更鸟特色参数（cdi3.json 中定义）：**
- `ParamGroup` - 按键：拿酒杯、麦克风、捂胸、声音触发
- `ParamGroup17` - 翅膀：翅膀c、翅膀b、翅膀a、翅膀2B、翅膀2A
- `ParamGroup16` - j：j1、j1y、j2、j2y
- `ParamGroup15` - 果冻眼：zuo1、zuo2、you1、you2
- `ParamGroup14` - s：s1、s2、s3、s4、ss1、ss2、ss3、ss4
- `ParamGroup13` - 头环：th1、th1y
- `ParamGroup12` - boba：boba x、boba xx、boba y、boba yy
- `ParamGroup11` - 裙子：qz1、qz1y、qz2、qz2y、qz3、qz3y
- `ParamGroup10` - 衣服饰品：yfsp1、yfsp1y、yfsp2、yfsp2y
- `ParamGroup9` - 小翅膀：cb1、cb2、cb3
- `ParamGroup8` - 后发2：hh1、hh2、hh3、hh1y、hh2y、hh3y
- `ParamGroup7` - 后发1：h1、h2、h3、h1y、h2y、h3y
- `ParamGroup6` - 侧发1：c1、c2、c3、cc1、cc2、cc3、ccc1、ccc2、...
- `ParamGroup5` - 前发2：qq1、qq1y、qq2、qq2y、qq3、qq3y
- `ParamGroup4` - 前发1：q1、q1y、q2、q2y、q3、q3y
- `ParamGroup3` - 五官：左眼开闭、左眼微笑、右眼、右眼微笑、眼珠X、眼珠Y、左眉上下、左眉角度、...
- `ParamGroup2` - 九轴类：角度X、角度Y、角度Z、X、Y、Z、脸颊泛红、身体旋转X、...
- 标准参数：呼吸

### huohuo/ - 藿藿模型
```
huohuo/
├── 藿藿.model3.json
├── 藿藿.moc3
├── 藿藿.cdi3.json             # 参数定义（155 个参数）
├── 藿藿.physics3.json
├── 藿藿.vtube.json            # 包含详细热键配置
├── 藿藿.8192/
│   ├── texture_00.png ~ texture_03.png
├── 动画文件：
│   ├── Scene1 复制 复制.motion3.json    # 待机动画
│   ├── haoqi.motion3.json                # 好奇
│   ├── keshui.motion3.json               # 瞌睡
│   ├── linghun.motion3.json              # 灵魂出窍
│   ├── qizi.motion3.json                 # 旗子
│   ├── yaotou.motion3.json               # 摇头
│   └── zhentou.motion3.json              # 枕头
├── 表情文件：
│   ├── 抱枕.exp3.json
│   ├── 拿旗子.exp3.json
│   ├── 白眼.exp3.json
│   ├── 黑脸.exp3.json
│   └── 眼泪.exp3.json
└── items_pinned_to_model.json
```

**藿藿特色参数（cdi3.json 中定义）：**
- `ParamGroup20` - 灵魂出鞘：灵魂显现、黑脸、抬手、手握抱枕x、眼泪、眼替换、尾巴晃动、浮动、...
- `ParamGroup12` - 动作：抱枕、拿旗子R、大臂摇动、下壁摇动、手、旗子飘动C、旗子飘动B、旗子飘动A
- `ParamGroup24` - 抱枕动画：抱枕动画抬手、枕头落下、左手显示消失、枕头显示消失
- `ParamGroup19` - 手：手C、手Y、手b、手a、手反转、手
- `ParamGroup18` - 脸：脸柔软度、柔软度Y、柔软度A、柔软度A Y
- `ParamGroup17` - 帽子：帽子飘带b、帽子飘带by、帽子飘带a、帽子飘带ay
- `ParamGroup16` - 衣服：衣服b、衣服Lby、衣服L a、衣服Lay、衣服、衣服y
- `ParamGroup15` - 长饰品：长饰品D、长饰品C、长饰品B、长饰品A、长饰品
- `ParamGroup14` - 饰品：饰品b、饰品by、饰品a、饰品ay
- `ParamGroup11` - 袖子物理：袖子物理b、袖子物理by、袖子物理a、袖子物理ay
- `ParamGroup9` - 耳朵：耳朵c、耳朵b、耳朵a、耳朵rc、耳朵rb、耳朵ra
- `ParamGroup10` - 耳朵物理：耳朵物理B、耳朵物理A
- `ParamGroup3` - 前发A：前发A1X、前发A1Y、前发A2X、前发A2Y、前发A3X、前发A3Y
- `ParamGroup4` - 刘海2：刘海2c、刘海2cy、刘海2b、刘海2by、刘海2a、刘海2ay
- `ParamGroup5` - 侧发：侧发C、侧发CY、侧发B、侧发BY、侧发A、侧发AY
- `ParamGroup6` - 呆毛：呆毛c、呆毛cy、呆毛b、呆毛by、呆毛a、呆毛ay
- `ParamGroup7` - 右侧发2：右侧发2c、右侧发2cy、右侧发2b、右侧发2by、右侧发2a、右侧发2ay
- `ParamGroup8` - 后发：后发d、后发dy、后发c、后发cy、后发b、后发by、后发a、后发ay
- `ParamGroup2` - 九轴类：角度X、角度Y、低头、角度Z、X、Y、Z、脸颊泛红、...
- `ParamGroup21` - NOX加的：胳膊旋转、左手旋转、右手旋转
- `ParamGroup23` - 尾巴位置2：尾巴x、[0]尾巴位置2、[1]尾巴位置2、[2]尾巴位置2、[3]尾巴位置2、[4]尾巴位置2
- `ParamGroup` - 五官类：左眼开闭、左眼微笑、右眼、右眼微笑、眼珠X、眼珠Y、左眉上下、左眉角度、...
- 标准参数：枕头形变、枕头x形变、呼吸

### jian/ - 简模型
```
jian/
├── 简.model3.json
├── 简.moc3
├── 简.cdi3.json             # 参数定义（236 个参数）
├── 简.physics3.json
├── 简.vtube.json
├── 简.8192/
│   └── texture_00.png
├── Scene1.motion3.json         # 动画
├── 表情文件（12个）：
│   ├── 生气.exp3.json
│   ├── 白眼.exp3.json
│   ├── 泪.exp3.json
│   ├── 脸黑.exp3.json
│   ├── 爱心眼.exp3.json
│   ├── 右手.exp3.json
│   ├── 星星眼.exp3.json
│   ├── 血.exp3.json
│   ├── 左手.exp3.json
│   └── 脸红.exp3.json
├── 简.png                       # 预览图
├── 按键.txt
└── items_pinned_to_model.json
```

**简特色参数（cdi3.json 中定义）：**
- `ParamGroup` - 开关：❤❤❤❤❤、❤ 脸黑、❤ 脸红、❤ 血、❤ 生气、❤ 星星眼、❤ 白眼、❤ 泪花、...
- `ParamGroup12` - 动画：❤❤❤❤❤、流泪、转圈眼、生气1、生气2
- `ParamGroup15` - 控制器：O X、O Y、O Z、O PX、O PY、呼吸
- `ParamGroup2` - 九轴：❤❤❤❤❤、脸X、脸Y、口内X、脸Z、胸X、胸Y、肩X、...
- `ParamGroup3` - 眼：❤❤❤❤❤、←眼开闭、←眼微笑、→眼开闭、→眼微笑、眼珠X、眼珠Y、瞳孔透视X、...
- `ParamGroup5` - 口：❤❤❤❤❤、口变形、口开闭、口歪←→、口歪←→吐舌、口歪←→EYE、口嘟嘴、吐舌、...
- `ParamGroup4` - 耳朵尾巴：→耳朵S1、→耳朵S2、→耳朵S3、←耳朵S1、←耳朵S2、←耳朵S3、耳朵表情、→耳-眼、...
- `ParamGroup6` - 物理头发：❤❤❤❤❤、呆毛SY1、呆毛SY2、呆毛S1、呆毛S2、呆毛S3、前发SY1、前发SY2、...
- `ParamGroup7` - 物理手：❤❤❤❤❤、←手臂S、←手肘S、←手腕S、←手指S1、←手指S2、←手指S3、→手臂S、...
- `ParamGroup8` - 物理胸：❤❤❤❤❤、胸SY、胸SY2、胸SY3、胸S1、胸S2、胸S3、胸装饰SY1、...
- `ParamGroup10` - 物理衣服：❤❤❤❤❤、衣服SY1、衣服SY2、衣服S1、衣服S2、衣领SY1、衣领S1、后摆S1、...
- `ParamGroup11` - 物理腿：❤❤❤❤❤、大腿S、脚装饰S1、脚装饰S2
- `ParamGroup13` - 物理眼睛：❤❤❤❤❤、←睫毛S、睫毛→S、←眼眶S1、←眼眶S2、眼眶→S1、眼眶→S2、←果冻眼S1、...
- `ParamGroup14` - 反绑：输入_BodyX、开关_BodyX、运算_BodyX、输出_BodyX、输入_BodyZ、开关_BodyZ、运算_BodyZ、输出_BodyZ、...
- `ParamGroup16` - 缓动：Body Angle X Vin、Body Angle X 反冲抵消、Body Angle X Vout放大、Body Angle X Vout、Body Angle X 验证、note

### yangyang/ - 秧秧模型
```
yangyang/
├── 秧秧.model3.json
├── 秧秧.moc3
├── 秧秧.cdi3.json             # 参数定义（182 个参数）
├── 秧秧.physics3.json
├── 秧秧.vtube.json
├── 秧秧.4096/
│   ├── texture_00.png ~ texture_02.png
├── animations/
│   └── Scene1.motion3.json
├── 表情文件：
│   ├── 反绑x.exp3.json
│   ├── 脸黑.exp3.json
│   ├── 眼泪.exp3.json
│   └── 悲.exp3.json
├── 秧秧.png
├── 按键.txt
└── items_pinned_to_model.json
```

**秧秧特色参数（cdi3.json 中定义）：**
- `ParamGroup` - KEY：眼泪、脸黑、x反绑
- `ParamGroup24` - 反绑参数：input_BodyX、运算暂存_BodyX、身体输出_BodyX、input_BodyY、运算暂存_BodyY、身体输出_BodyY、input_BodyZ、运算暂存_BodyZ、身体输出_BodyZ、input_HipX、...
- `ParamGroup4` - 反绑开关：反绑开关_BodyX、反绑开关_BodyY、反绑开关_BodyZ、反绑开关_HipX、反绑开关_HipZ、反绑开关_ShoulderY
- `ParamGroup23` - 控制器：OX、OY、OZ、OPX、OP
- `ParamGroup17` - 身体：身体旋转　X、身体旋转　Y、身体旋转　Z、□身体位移RX、□身体位移RY、身体位移RZ、屁股　X、屁股　Y、屁股　Z、□屁股　X、...
- `ParamGroup2` - 头：000、角度 X、角度 Y、角度 Z、嘴 大小、嘴　变形、嘴　张开和闭合、歪嘴
- `ParamGroup11` - 眼：左眼　开闭、左眼　微笑、右眼   开闭、右眼　微笑、眼珠 X、眼珠 Y、眼珠 X物理、眼珠 Y物理、←睫毛 S、←眼眶 S1、...
- `ParamGroup6` - 头发：呆毛 SY1、呆毛 SY2、呆毛 S1、呆毛 S2、呆毛 S3、前发 SY1、前发 SY2、前发 S1、前发 S2、前发 S3、...
- `ParamGroup13` - 物理 装饰：耳环 S1、耳环 S1、发饰 SY1、发饰 SY2、发饰 S1、发饰 S2、发饰 S3、帽子 SY1、帽子 SY2、帽子 S1、...
- `ParamGroup3` - 物理 衣服：装饰 SY1、装饰 S1、衣服 SY1、衣服 SY2、衣服 SY3、衣服 SY4、衣服 S1、衣服 S2、衣服 S3、衣服 S4、...
- `ParamGroup12` - 物理 手：←手臂 S、←手肘 S、←手腕 S、←手指 S1、←手指 S2、→手臂 S、→手肘 S、→手腕 S、→手指 S1、→手指 S2
- `ParamGroup7` - 胸：胸 SY、胸 SY2、胸 SY3、胸 S1、胸 S2、胸 S3、胸装饰 SY1、胸装饰 SY2、胸装饰 S1、胸装饰 S2
- `ParamGroup5` - 动画：圈圈眼、左流泪、右流泪
- 标准参数：呼吸

### rice/ - Rice 模型
```
rice/
├── Rice.model3.json
├── Rice.moc3
├── Rice.cdi3.json             # 参数定义（96 个参数）
├── Rice.physics3.json
└── Rice.2048/
    ├── texture_00.png ~ texture_01.png
```

**Rice特色参数（cdi3.json 中定义）：**
- `ParamGroupFlame` - 炎：炎 表示、炎、炎の揺れ、炎の位置 X、炎の位置 Y
- `ParamGroupEffectsA` - エフェクトA：溜めの表示、溜め、手の光Aの表示、手の光Aの拡縮、波動A、魔法陣Aの表示、魔法陣Aの回転、魔法陣A 光、エフェクトAの位置 X、エフェクトAの位置 Y
- `ParamGroupEffectsB` - エフェクトB：手の光Bの表示、手の光Bの拡張、魔法陣Bの表示、魔法陣Bの回転、魔法陣Bの移動、魔法陣Bの角度 X、波動Bの表示、波動Bの拡張、波動Bの太さ、エフェクトBの位置 X、...
- `ParamGroupArms` - 腕：右上腕、右上腕 Y、右前腕、右前腕 Y、右手、左上腕、左前腕、左手、腕 切り替え、本 ページ
- `ParamGroupSwing` - 揺れもの：頭リボンの揺れ、胸リボンの揺れ01、胸リボンの揺れ02、腰リボンの揺れ01、腰リボンの揺れ02、スカートのなびき、スカートの揺れ X、スカートの揺れ Y
- `ParamGroupHairFront` - 前髪：髪揺れ 前01、髪揺れ 前02
- `ParamGroupHairSideR` - 右横髪：[0]右横髪、[1]右横髪、[2]右横髪、[3]右横髪、[4]右横髪
- `ParamGroupHairSideL` - 左横髪：[0]左横髪、[1]左横髪、[2]左横髪、[3]左横髪、[4]左横髪
- `ParamGroupHairBackA` - 後髪A：[0]後髪A、[1]後髪A、[2]後髪A、[3]後髪A、[4]後髪A、[5]後髪A、[6]後髪A
- `ParamGroupHairBackB` - 後髪B：[0]後髪B、[1]後髪B、[2]後髪B、[3]後髪B、[4]後髪B、[5]後髪B、[6]後髪B、[7]後髪B、[8]後髪B
- `ParamGroupHairBackC` - 後髪C：[0]後髪C、[1]後髪C、[2]後髪C、[3]後髪C、[4]後髪C、[5]後髪C、[6]後髪C、[7]後髪C、[8]後髪C
- `ParamGroupFace` - 顔：角度 X、角度 Z
- `ParamGroupEyes` - 目：左目 開閉、右目 開閉、目玉 X、目玉 Y
- `ParamGroupBody` - 体：体の回転 X、体の回転 Y、体の回転 Z、右肩、左肩、屈伸、右足の位置、右足の上下、全体のZ
- 标准参数：摇动 前发、摇动 侧发、摇动 后发

### nicole/ - Nicole 模型
```
nicole/
├── Nicole.model3.json
├── Nicole.moc3
├── Nicole.cdi3.json             # 参数定义（88 个参数）
├── Nicole.physics3.json
├── Nicole.vtube.json
├── Nicole.8192/
│   ├── texture_00.png ~ texture_01.png
├── 表情文件（11个）：
│   ├── Love Hand Posture.exp3.json    # 爱心手势
│   ├── Love eye.exp3.json              # 爱心眼
│   ├── Money Hand Posture.exp3.json   # 金钱手势
│   ├── Money eye.exp3.json             # 金钱眼
│   ├── Phone Hand Posture.exp3.json   # 电话手势
│   ├── Y Hand Posture.exp3.json        # Y 手势
│   ├── black face.exp3.json            # 黑脸
│   ├── cry.exp3.json                   # 哭
│   ├── shyness.exp3.json               # 害羞
│   ├── sitting position.exp3.json      # 坐姿
│   └── Milk Tea.exp3.json              # 奶茶
├── Nicole.png                   # 预览图
└── items_pinned_to_model.json
```

**Nicole特色参数（cdi3.json 中定义）：**
- `ParamGroup5` - 按键：比y、比心、奶茶、扇子手、手机手、撩头发手、叉腰手、坐姿手、坐姿、黑脸、...
- `ParamGroup4` - 9轴：...、角度 X、角度 Y、角度 Z、身体旋转　X、身体旋转　Y、身体旋转　Z、前倾后仰、身体x、身体y、...
- `ParamGroup6` - 刘海：刘海C、刘海CY、刘海B、刘海BY、刘海A、刘海AY
- `ParamGroup11` - boba：bobax、bobaxx、bobay、bobayy
- `ParamGroup10` - 配饰：ps1、ps1y、ps2、ps2y
- `ParamGroup8` - 后发：h1、h1y、h2、h2y、h3、h3y
- `ParamGroup9` - 后发1：hf1、hf1y、hf2、hf2y、hf3、hf3y
- `ParamGroup7` - 侧发：c1、c1y、c2、c2y、c3、c3y
- `ParamGroup` - 眼：左眼　开闭、左眼　微笑、右眼、右眼　微笑、眼珠 X、眼珠 Y、x透视、y透视
- `ParamGroup2` - 眉：左眉  上下、左眉　変形、左眉　角度、右眉　上下、右眉　変形、右眉　角度
- `ParamGroup3` - 口：...、嘴　变形、嘴　张开和闭合、MouthX、Tongue Out、PuckerWiden、MouthJawOpen、MouthShrug、CheekPuff
- 标准参数：呼吸、摇动 前发、摇动 侧发、摇动 后发

---

## 加载模型代码示例

### 方式一：使用 pixi-live2d-display（推荐）

```javascript
import { PIXI } from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display'

// 加载符玄模型
const model = await Live2DModel.from('/live2d/fuxuan/符玄.model3.json')

// 获取参数列表（从 cdi3.json）
console.log(model.internalModel.coreModel.getParameterIds())

// 设置参数值
model.coreModel.setParameterValueById('ParamEyeLOpen', 1)
model.coreModel.setParameterValueById('ParamMouthOpenY', 0.5)
```

### 方式二：动态探测参数（支持中文显示）

```javascript
async function loadModelWithParams(modelPath) {
  const model = await Live2DModel.from(modelPath)

  // 尝试加载 cdi3.json 获取中文参数名
  const cdiPath = modelPath.replace('.model3.json', '.cdi3.json')
  let paramNames = {}

  try {
    const cdi = await fetch(cdiPath).then(r => r.json())
    cdi.Parameters.forEach(p => {
      paramNames[p.Id] = p.Name
    })
  } catch (e) {
    console.log('No cdi3.json found')
  }

  return { model, paramNames }
}
```

---

## 参数控制说明

### 标准参数 ID（大多数模型都有）

| 参数 ID | 说明 | 范围 |
|---------|------|------|
| `ParamAngleX` | 头部 X 轴旋转（左右） | -30 ~ 30 |
| `ParamAngleY` | 头部 Y 轴旋转（上下） | -30 ~ 30 |
| `ParamAngleZ` | 头部 Z 轴旋转（倾斜） | -30 ~ 30 |
| `ParamBodyAngleX` | 身体 X 轴旋转 | -10 ~ 10 |
| `ParamBodyAngleY` | 身体 Y 轴旋转 | -10 ~ 10 |
| `ParamBodyAngleZ` | 身体 Z 轴旋转 | -10 ~ 10 |
| `ParamEyeLOpen` | 左眼开闭 | 0 ~ 1 |
| `ParamEyeROpen` | 右眼开闭 | 0 ~ 1 |
| `ParamEyeLSmile` | 左眼微笑 | 0 ~ 1 |
| `ParamEyeRSmile` | 右眼微笑 | 0 ~ 1 |
| `ParamEyeBallX` | 眼球 X | -1 ~ 1 |
| `ParamEyeBallY` | 眼球 Y | -1 ~ 1 |
| `ParamBrowLY` | 左眉上下 | -1 ~ 1 |
| `ParamBrowRY` | 右眉上下 | -1 ~ 1 |
| `ParamBrowLForm` | 左眉变形 | -1 ~ 1 |
| `ParamBrowRForm` | 右眉变形 | -1 ~ 1 |
| `ParamMouthForm` | 嘴型 | -1 ~ 1 |
| `ParamMouthOpenY` | 嘴张开度 | 0 ~ 1 |
| `ParamBreath` | 呼吸 | 0 ~ 1 |

### 嘴型同步（LipSync）

语音播放时控制嘴部参数：

```javascript
// 简单方案：播放语音时张嘴
function speakWithLipSync(text, tts, model) {
  tts.speak(text)
  model.coreModel.setParameterValueById('ParamMouthOpenY', 1)

  // 监听语音结束
  tts.onEnd = () => {
    model.coreModel.setParameterValueById('ParamMouthOpenY', 0)
  }
}
```

---

## 物理配置

`.physics3.json` 定义了物理模拟，通常用于：
- 头发摆动
- 衣服/丝带飘动
- 饰品晃动

物理效果通常通过参数自动应用，无需手动控制。

---

## 注意事项

1. **分辨率**：不同模型使用不同纹理分辨率（2048/4096/8192），加载时注意性能
2. **中文参数**：优先从 `.cdi3.json` 读取参数中文名显示给用户
3. **表情/动画**：`.exp3.json` 和 `.motion3.json` 是可选的，不是每个模型都有
4. **VTube Studio**：`*.vtube.json` 仅作为参考，本项目使用 pixi-live2d-display
5. **文件路径**：所有路径相对于 `.model3.json` 所在目录

---

## 参考资料

- [Live2D Cubism 4 官方文档](https://docs.live2d.com/cubism-sdk-manual/top/)
- [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)


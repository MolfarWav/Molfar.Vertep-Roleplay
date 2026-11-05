<!-- source: 82c26de2d666 -->
# Roleplay设置的位置

Roleplay没有针对所有内容的单一设置页面。设置位于它们所更改内容的附近，其中两个位于Molfar Vertep的主Settings中。本页是一个查找指南。

## 两个Settings，不要混淆

- **主Settings**，即Molfar Vertep的设置（整个页面的齿轮图标）：模型和连接、整个配置文件的备份、更新。在那里选择和测试模型；参见[[vertep:settings]]和[[vertep:models]]。在那里加星标的模型会在聊天中显示为快速切换项。
- **Roleplay settings**：Home顶部的“Roleplay settings”按钮（在手机上则在菜单中）。它尚未列在主Settings中，因此请在Roleplay自身中查找。它有十个部分：Appearance、Chat Behavior、Streaming、Themes、Prose Colors、Custom CSS、Card tasks、Import、Data和Guide。顶部的搜索框可筛选这些部分。

各部分的简要功能：Appearance是语言、字体、聊天宽度和头像；Chat Behavior包含诸如按Enter发送和确认删除等开关；Streaming选择回复是边写边显示还是完成后显示；Card tasks选择卡片助手（“Structure it”“Fill empty”）在卡片没有自带模型时使用的模型；Import导入预设、角色、设定集、聊天和备份zip（SillyTavern预设导入时，其选择列表成为Choices，作者的说明成为备注，其“请勿改动”部分被锁定；从Roleplay导出的预设会带着它所有的Choices返回）；Data将Roleplay自身的数据导出和恢复为zip（整个配置文件由主Settings的Backup保存）；Guide显示或隐藏简短导览和“What's new”。

## 位于Roleplay其他位置的设置

- **Dashboard**：其“Settings”按钮，包含Sensor、Event vocabulary、“What the model sees”和“Tune with Molfar”标签页。参见[[dashboard]]。
- **Litopys**：Library中的“Litopys settings”齿轮图标。参见[[litopys]]。
- **World DM**：聊天顶部的World面板和World部分；“World settings”保存DM模型。参见[[world-dm]]。
- **Agents**：Canvas的Agents和“Agent sets”面板以及聊天的Agents标签页。参见[[agents]]。
- **提示与采样**：**Presets**部分（可切换的部分、变量、采样器，以及最终请求的预览）和Canvas的Prompt面板（针对单个聊天）。聊天的Preset面板会在预设名称下显示一行“Works with”：此聊天中该预设有规则的功能（Dashboard、Litopys、World DM、骰子等），以及其中哪些在此聊天中是关闭的。
- **卡片自身的设置**：其编辑器标签页，包括颜色、正则表达式和高级选项。参见[[characters]]。
- **设定集**：每本设定集都有自己的规则（扫描深度、容量上限、Global开关）。参见[[memory]]。
- **Inbox**有针对每种等待事项的开关。

## 工具

**Tools**部分是一行标签页，分为Panels（插件面板，如Tool Calling）、Text & voice和System。

- **Regex**：查找替换脚本，仅在你开启的位置生效。
- **Translation**：提供方、两种语言和自动翻译模式；也可翻译当前打开的聊天。
- **Image Generation**：聊天模型描述场景，图像模型绘制。默认关闭。开启交互模式后，你会先检查每个提示。
- **TTS**：朗读回复。默认关闭。
- **Data Bank**：用于检索的文本文档（[[memory]]）。
- **Backgrounds**：聊天背后的图片。
- **MCP**：引擎共享的工具服务器。每个都在此应用中默认关闭；按需开启。
- **Plugins**：显示哪些插件在应用背后运行以及每个插件可以做什么。安装、启用和禁用在Molfar Vertep的Plugins按钮中进行，而不是在这里。
- **Tool Calling**（在Panels中）：让模型在书写时使用工具。Dice Roller和Picture是内置的，在你开启之前保持关闭。

此外：**Shortcuts**保存快速回复，可在事件上自动运行；Themes可立即更改配色方案，Prose Colors重新着色对话和叙述，Custom CSS最后应用。

返回[[index]]。

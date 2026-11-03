<!-- source: 51684176be4b -->
# 你的第一个故事

这是从一个空的Roleplay到运行中故事的最短路径，也是一份关于哪些内容会自动运行、以免你感到意外的清单。你首先需要一个模型连接：参见[[vertep:models]]。

## 步骤

1. **获取一张卡片。** 在Home上按“New character”并编写一个，或按“Import card”从文件导入PNG或JSON卡片。你也可以搜索Marketplace部分，或按“With Molfar”让Molfar根据你的想法起草一张卡片。参见[[characters]]。
2. **保存它。** 卡片编辑器会将编辑内容保存在草稿中，直到你按“Save changes”。
3. **选择一个人格**（你所扮演的人），在Personas部分中操作，或保留默认设置。“Use this persona”会将其设为你的默认人格。
4. **开始一个聊天。** 在卡片上按“New chat”。聊天会以卡片的第一条消息打开。
5. **检查模型。** 聊天顶部的胶囊菜单有一个Model标签页；在那里选择模型只会更改此聊天。
6. **书写。** 在每条回复下方，你可以翻阅其他版本（滑动）；最后一个版本上的右箭头会请求一个新版本。若要按方向重做回复，请使用“+”菜单中的“Regenerate with a hint”。消息上的“More”按钮提供编辑、分叉、提示预览等功能。

## 自动运行的内容

聊天产生回复后，后台助手会运行，每个助手都有自己的模型调用：

- Dashboard在每次回复后读取场景（[[dashboard]]）。
- Litopys在场景结束时撰写章节（[[litopys]]）。
- World DM在其最低活动级别（Chronicler）下，将人物和地点记录到此聊天的设定集中（[[world-dm]]）。
- 没有soul的卡片会自动获得一个提议的soul（[[soul]]）。

这些任务的失败会列在Inbox中。

## 如果模型较小、较慢或按调用付费

最节省成本的方法，按顺序排列：

1. 在Dashboard的“Settings”中，将模式设置为“Manual”（之后仅在你按Refresh时更新），或选择一个小模型作为“Sensor model”。
2. 在Library的“Litopys settings”中，降低“Memory size”或关闭“Chapters and facts”。
3. 在World面板中，选择“Off”级别（当场景提到新地点时，它仍会进行少量调用）或选择一个便宜的“DM model (all chats)”。
4. 在Dashboard设置中，关闭“Rate characters automatically”。
5. 在Canvas上，Prompt面板显示下一次请求的每个部分及其token数，并允许你为一个聊天关闭某些部分。

上下文窗口较小的免费模型最适合使用Manual dashboard和Compact memory。

## 下一步

[[memory]]解释记忆的种类；[[settings]]说明各项设置的位置。

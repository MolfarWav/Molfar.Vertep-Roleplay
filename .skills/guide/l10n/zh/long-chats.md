<!-- source: 9efd9a7576a4 -->
# 长聊天与token成本

持续数周的聊天会越来越长，每次回复都会把更多内容发送给模型。本页面向回复变慢或变贵的人，也面向模型忘记故事开头的人。

## Request size按钮

默认情况下，只要窗口还有空间，整个聊天都会被发送。在大窗口上，成本会持续增长，因此聊天顶部在故事工具旁边有一个**Request size**按钮（在手机上位于Menu中）。它显示上一次请求发送了多少token、提供方计算的完整提示，以及该请求交给了哪个模型。按下它可查看模型、其窗口和你的限制。低于限制的四分之三时为青绿色，超过后变为琥珀色，超过限制时则为红色并带有警告标志。Canvas的Prompt面板会列出请求的每个部分（[[canvas]]）。

当一条回复使请求超过限制时，会弹出一个窗口：

- **Yes, continue in a new chat**立即创建下一个聊天并打开它。
- **Not now**会在请求增长一半之前，为本聊天隐藏该弹窗。关闭弹窗即视为Not now。
- **Send finished scenes as chapters instead**在Litopys开启时出现（见下一节）。

限制位于弹窗底部，也可在Library的齿轮“Litopys settings”中，于“In the prompt”区块的“Warn me when a request gets big”设置：模型窗口的60%（默认）、你输入的大小（如100k）或选择的大小（16k到500k），或从不提醒。已超过限制的聊天会显示红色按钮，但不再弹出窗口，直到新回复使其继续增长。

记录有自己的大小。在同一区块中，“Memory size”默认为Auto：模型窗口的15%，在800到16000个token之间。“Compact”将其保持在800。

## 削减成本的开关

在同一区块中，“Older messages leave the prompt”有两个选项：

- **Only when the window is full**（默认）：只要消息仍能放得下，就会发送每一条消息。
- **By scenes**：一旦某个章节覆盖了一个场景，该场景就会被章节替换。只保留最后几条消息逐字不变（“Direct messages after the scenes”，2条或更多）。最新的场景还没有章节，因此会完整发送。

“By scenes”会损失一些细节：章节是复述，较弱的模型可能会丢失一些小事。对于绝不能丢失的事实，请将其置顶（[[litopys]]）。其他削减方式：

- Canvas的Prompt面板中的history卡片和Details：只发送最后N条消息（电脑上，仅针对该聊天）。
- 将“Memory size”降为Compact，或关闭“Chapters and facts”。

## 开始新聊天并保留故事

在一个自然的停顿处，延续旧聊天的新聊天会以一个较小的提示开始，并且仍然知道发生过什么。

1. 在聊天中打开“More”，选择**Continue in a new chat**，或在弹窗中按Yes。
2. 新聊天立即创建并打开。它会保留预设及其选择、人格、模型、代理组、群组的回合顺序，以及World DM的世界。
3. 它会获得旧故事作为背景：章节和事实，最多回溯到三个聊天，并受“Backstory budget”限制。旧消息不会被发送。

较早的聊天随后会自动移入Archive（见下一节）。这一链接即Canvas所画的那条，Canvas可以之后更改它：参见[[canvas]]。若要选择另一个较早的聊天，请从角色开始一个聊天，并在“New chat with”步骤中使用**Continues**菜单。

新聊天会以卡片的第一条问候语打开；“Edit the first message”让你从故事停下的地方接着写。

## 归档已完结的故事

你不再需要的故事可以移入**Archive**。这是聊天的一种状态，而非移动：聊天仍留在原处，因此它的记忆、Canvas上的链接以及由它制作的任何书籍都会继续有效。

- 在Chats中选中一个聊天并按**Archive**（其面板中的琥珀色按钮），或用Select勾选多个。在聊天内，它位于“Manage chat”菜单中。
- 已归档的聊天会离开列表和Home。筛选器下方的琥珀色**Archive**一行可打开它们；**Back to chats**返回。
- 它以只读方式打开：你可以阅读、复制、从某条消息分支、导出，并查看其Dashboard和Library，但不能发送、滑动、编辑或删除。其底部位置提供**Continue in a new chat**。**Unarchive**（在其面板或横幅中）可使其恢复正常。
- 当尚无聊天延续此聊天时，确认对话框会提供**Archive and continue**。
- **它会自动发生**：当一个聊天成为另一个聊天的较早聊天时，即通过Canvas上的链接、Continue in a new chat、上面的弹窗，或“Continues”中的选择。一条带有Undo的提示会说明这一点。分支不是延续，会保持原样。若要关闭它，请在Library的齿轮“Litopys settings”中关闭“Archive the earlier chat when it is continued”。
- 一个已达100条或更多消息、并且安静了一周的聊天，会在列表中带有一个小的“Long chat · archive?”标签，并在其面板中有一条提示。不会替你归档任何东西。

这样做的好处：较早的聊天不再变化，因此它的记忆保持稳定，延续它的新聊天会把它当作已完结的故事来读取（[[litopys]]）。

## 章节丢掉的细节

章节是复述，因此较早聊天中的一个小细节可能已从中消失。在Library的Litopys settings中，“In the prompt”区块下的**Word-for-word memories of earlier chats**开关，让一个延续其他聊天的聊天，在所说的话与原始消息共享罕见词时，带回原始消息中的一两个段落（[[litopys]]）。默认关闭。

## 将故事保存为书

在Library的Litopys中，“Save as a book”会将一个聊天的章节、弧线和事实复制到你所选聊天的Data Bank书架上：参见[[memory]]。

## 查看模型得到了什么

如果角色忘记了某件事，请打开Canvas > Prompt，将“Parts”切换为“Memory”：它会显示哪些事实被放入、哪些被排除，以及原因。聊天顶部的**Fired**按钮会显示上一条回复和整个聊天的情况。

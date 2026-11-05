<!-- source: c68da6730f1a -->
# Litopys：故事记录

Litopys（编年史）是一个聊天的长期记忆。它在后台阅读故事，为每个已结束的场景撰写一个章节，并记录故事已经确立的事实。当聊天太长、超出模型的窗口时，记录会承载故事继续向前。它用于长故事；你无需手动启动。

## 章节与事实

- **章节**说明一个场景中发生了什么变化，而不是复述经过。它在下一个场景开始后才会撰写，因此最新的场景可能还没有章节。新地点或时间跳跃会结束一个场景；你也可以在消息的“More”菜单中，于Story下把一段消息手动标记为场景。
- **事实**是一句始终成立的短句，例如：“Medli hides her wings at the market.”事实有类型、权重（Everyday、Important、Key），以及知情者。你可以手动添加、编辑、置顶或停用事实。
- **提议**是Litopys的建议：合并两条事实、停用一条、改写、置顶。每一项都由你接受或拒绝。
- 角色明显表现出的**习惯**也可能出现，在多个场景中重复后就会成为习惯。

## 在哪里查看

在聊天顶部按**Record**（在手机上则在Menu中），即可在侧面板中查看本聊天的记录。侧边栏的**Library**部分会显示每个聊天的记录，它有两个视图：Overview（时间线、每个角色一张卡片、待处理的提议）和Details，后者包含Chapters、Facts、Proposals、Habits和Activity标签页。Activity标签页记录Litopys所做的操作，并在可能的情况下提供Undo。齿轮图标（“Litopys settings”）用于设置记录的撰写方式。

## 进入提示的内容

默认情况下，记录会自动插入。“Memory size”决定它最多可占用多少token：默认为Auto（模型窗口的15%，至少800、至多16000），也可选择Compact（800 token），或Custom（从200到16000自定义）。Auto会让大窗口承载更多故事内容；在小型模型上，它基本保持在800左右。你之前手动保存的大小会保持不变。当所有内容都能放下时，全部发送；否则优先发送对当前场景最重要的部分。小型模型需要较小的大小。关闭“Chapters and facts”意味着不再生成新的章节或事实，提示中也不会添加任何内容。

较早的消息只有在窗口已满时，或在章节覆盖它们之后按场景逐个离开提示。“Older messages leave the prompt”设置可以选择具体方式。

## 按含义匹配

记忆最初按词查找事实和章节。配置嵌入模型后，它还能按含义查找：用其他说法提出的问题，也能找到对应的事实。卡片**Matching by meaning**（位于聊天记录的顶部，以及Canvas > Prompt > Memory中）会显示当前状态：off（关闭）、failing（失败）、no vectors yet（尚无向量）、partly done（部分完成）、done（完成）或made by another model（由其他模型生成）。在Settings > Memory中设置一次模型即可：默认情况下，应用先使用你自己电脑上的模型（LM Studio或Ollama），其次是带密钥的API连接，最后是OpenRouter。嵌入模型的一次调用成功后（按下卡片上的按钮，或完成一次回复），引擎会每隔几分钟检查一次，并自行为每个聊天和Data Bank文件补齐缺失的向量；超过300,000 token的内容则需要按按钮才会处理。设置中的开关**Make vectors by itself**（位于Settings > Memory）可以将其关闭。按钮**Embed N items**会先说明有多少条目、约需多少token，然后立即执行。无论是否开启该开关，新场景都会为新条目生成嵌入。如果更换了嵌入模型，旧向量在你按下**Embed again**之前不会被使用。Data Bank有自己的卡片**Data Bank by meaning**，位于Settings > Data Bank的顶部：它对文件段落和快照书籍的处理方式相同，部分覆盖的文件会显示“7 of 12 by meaning”。

## 建议与整理

“Suggestions”默认为“Ask me first”：每一次置顶和改写都要等待你同意。安静模式会立即应用置顶和改写，并记录在Activity中。停用和合并则始终需要你确认。“Tidy facts automatically”会在新增30条事实后查找重复和矛盾之处，每60条事实额外调用一次模型。

## 重建

“Rebuild from scratch”会在后台根据消息重写章节和事实，大约每30秒调用一次模型。你自己编辑和置顶的事实，以及编辑过的章节会被保留；在新记录准备好之前，继续使用当前的记录。如果还没有任何场景结束，它会拒绝启动。

如果你在章节撰写之后编辑了消息，该章节会被标记为过期，并被重写。

## 相关

角色卡也可以保存已结束聊天的记忆：参见[[memory]]。帮助文章*Litopys: chapters and proposals*、*Facts and proposals*和*Overview vs Details*介绍了这些界面。

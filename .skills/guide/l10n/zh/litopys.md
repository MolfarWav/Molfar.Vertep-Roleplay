<!-- source: 22d2bcc1795f -->
# Litopys：故事记录

Litopys（编年史）是一个聊天的长期记忆。它在后台阅读故事，为每个已结束的场景撰写一个章节，并记录故事已经确立的事实。当聊天太长、超出模型的窗口时，记录会承载故事继续向前。它用于长故事；你无需手动启动。

## 章节与事实

- **章节**说明一个场景中发生了什么变化，而不是复述经过。它在下一个场景开始后才会撰写，因此最新的场景可能还没有章节。新地点或时间跳跃会结束一个场景；你也可以在消息的“More”菜单中，于Story下把一段消息手动标记为场景。
- **事实**是一句始终成立的短句，例如：“Medli hides her wings at the market.”事实有类型、权重（Everyday、Important、Key），以及知情者。你可以手动添加、编辑、置顶或停用事实。

**一条事实可以让整个群组知道**，例如一个公会：在“Known to”中输入`group: Guild of Ravens`，所有在场景中的成员都会知道它，其他人则不知道。当卡片带有写作`group: Guild of Ravens`或`faction: Guild of Ravens`的标签（其他标签不构成群组），或当World DM的Group或Place记录列出了Members（[[world-dm]]）时，群组即存在。成员在场景中时，撰写章节的模型会得知该群组，并可以将其用于整个群组都得知的消息。快照书籍在你保存时会复制成员的名字。

- **信念**是“Belief”类型的事实：角色在谎言中被告知、但仍视其为真的内容。当一个谎言在Dashboard的Said列表中停留一段时间后，它会出现，归属于相信它的人，并且只进入该角色的回复。当该角色得知真相或你移除谎言时，它结束；你也可以手动点**Knows the truth now**结束它，这也会告知Dashboard。当某个信念进入了一条回复时，Memory视图会对其加以标记。参见[[dashboard]]。
- **提议**是Litopys的建议：合并两条事实、停用一条、改写、置顶。每一项都由你接受或拒绝。
- 角色明显表现出的**习惯**也可能出现，在多个场景中重复后就会成为习惯。

## 在哪里查看

在聊天顶部按**Record**（在手机上则在Menu中），即可在侧面板中查看本聊天的记录。侧边栏的**Library**部分会显示每个聊天的记录，它有两个视图：Overview（时间线、每个角色一张卡片、待处理的提议）和Details，后者包含Chapters、Facts、Proposals、Habits和Activity标签页。Activity标签页记录Litopys所做的操作，并在可能的情况下提供Undo。齿轮图标（“Litopys settings”）用于设置记录的撰写方式。

## 早期聊天的逐字记忆

章节是复述，因此像斗篷的颜色、一个确切的承诺这样的小细节可能会从中遗漏。当本聊天延续较早的聊天（[[long-chats]]）时，可在Library的Litopys settings中，于“In the prompt”区块打开**Word-for-word memories of earlier chats**。之后，当正在说的话与某个较早段落共享多个罕见词时，原始消息中的一两个段落会进入提示，并标注为比事实更早。它会读取整条链，而不只是最近的三个聊天；角色只会获得其在场的场景中的段落。这不需要模型调用；默认关闭，最多占用“Word-for-word budget”个token（默认400）。如果没有任何段落共享足够多的罕见词，则不会添加任何内容。Memory视图和Fired面板会列出上一条回复添加了什么；Canvas的Prompt面板对本聊天有自己的开关。

## 进入提示的内容

默认情况下，记录会自动插入。“Memory size”决定它最多可占用多少token：默认为Auto（模型窗口的15%，至少800、至多16000），也可选择Compact（800 token），或Custom（从200到16000自定义）。Auto会让大窗口承载更多故事内容；在小型模型上，它基本保持在800左右。你之前手动保存的大小会保持不变。当所有内容都能放下时，全部发送；否则优先发送对当前场景最重要的部分。小型模型需要较小的大小。关闭“Chapters and facts”意味着不再生成新的章节或事实，提示中也不会添加任何内容。

较早的消息只有在窗口已满时，或在章节覆盖它们之后按场景逐个离开提示。“Older messages leave the prompt”设置可以选择具体方式。[[long-chats]]说明应选哪一种。

## 按含义匹配

记忆最初按词查找事实和章节。配置嵌入模型后，它还能按含义查找：用其他说法提出的问题，也能找到对应的事实。卡片**Matching by meaning**（位于聊天记录的顶部，以及Canvas > Prompt > Memory中）会显示当前状态：off（关闭）、failing（失败）、no vectors yet（尚无向量）、partly done（部分完成）、done（完成）或made by another model（由其他模型生成）。在Settings > Memory中设置一次模型即可：默认情况下，应用先使用你自己电脑上的模型（LM Studio或Ollama），其次是带密钥的API连接，最后是OpenRouter。嵌入模型的一次调用成功后（按下卡片上的按钮，或完成一次回复），引擎会每隔几分钟检查一次，并自行为每个聊天和Data Bank文件补齐缺失的向量；超过300,000 token的内容则需要按按钮才会处理。设置中的开关**Make vectors by itself**（位于Settings > Memory）可以将其关闭。按钮**Embed N items**会先说明有多少条目、约需多少token，然后立即执行。无论是否开启该开关，新场景都会为新条目生成嵌入。如果更换了嵌入模型，旧向量在你按下**Embed again**之前不会被使用。Data Bank有自己的卡片**Data Bank by meaning**，位于Settings > Data Bank的顶部：它对文件段落和快照书籍的处理方式相同，部分覆盖的文件会显示“7 of 12 by meaning”。

## 单个聊天的设置

聊天记录的**Settings**标签页（位于Record侧面板中，以及Library里Activity旁边）只为本聊天设置Litopys：最短和最长的场景、有多少条最近的消息保持逐字原样（或在较早消息以“By scenes”方式离开时，场景之后保留多少条直接消息）、较早消息离开提示的方式，以及一个角色最多可置顶多少条事实。留空的字段会沿用齿轮中的“Litopys settings”，并以“Library: N”显示该值。离开字段时保存数值。“Use the Library settings”会清除所有这些设置。场景变化频繁的聊天，适合把最短场景设得较低，例如3：这样一个短场景也会获得自己的章节。已经撰写的章节保持不变；使用Rebuild可按新的长度重写它们。

## 建议与整理

“Suggestions”有三种选择。“Ask me first”：每条建议都要等待你同意。“Only risky ones”（新安装的默认值）：常规建议会立即应用，记录在Activity中并可用Undo撤销，只有有风险的建议等待，且每条都附有理由：一次合并会让更多人知道只有部分人知道的事实；修改你置顶、撰写、编辑或标记为关键的事实；持久的改变或信念；以及可能与你置顶的事实相矛盾的新事实。同一理由也会显示在Inbox中。“Apply pins and rewrites quietly”：只有置顶和改写会直接通过；停用和合并仍等待你处理。“Tidy facts automatically”会在新增30条事实后查找重复和矛盾，每60条事实额外调用一次模型。

## 重建

“Rebuild from scratch”会在后台根据消息重写章节和事实，大约每30秒调用一次模型。你自己编辑和置顶的事实，以及编辑过的章节会被保留；在新记录准备好之前，继续使用当前的记录。如果还没有任何场景结束，它会拒绝启动。

如果你在章节撰写之后编辑了消息，该章节会被标记为过期，并被重写。

## 相关

角色卡也可以保存已结束聊天的记忆：参见[[memory]]。帮助文章*Litopys: chapters and proposals*、*Facts and proposals*和*Overview vs Details*介绍了这些界面。

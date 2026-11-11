<!-- source: 76ba933a11e2 -->
# Litopys：故事记录

Litopys（编年史）是一个聊天室的长期记忆。它在后台阅读故事，为每个已完成的场景写一章，并记录故事已确立的事实。当聊天室变得太长、超出模型的上下文窗口时，记录会把故事延续下去。长篇故事用它；你不需要手动启动它。

## 章节与事实

- **章节**说的是一个场景里发生了什么变化，而不是复述。它在下一个场景开始时才写，所以最新的场景可能还没有章节。一个新地点或一次时间跳跃会结束一个场景；你也可以自己结束场景。当你的角色停留在一个地方、故事在没有移动的情况下发生转折时，记录看不到边界；在 Library 中打开聊天室的记录，找到顶部的 **Scenes** 卡片（它会显示还有多少条消息不属于任何场景），然后按 **Suggest scenes**：模型会读取不属于任何场景的消息，每 40 条一次请求，并提出故事在哪里转折，每个都带有标题和理由。这需要一两分钟，你可以关掉窗口。勾选你想要的场景，然后按 **Save scenes**；**Adjust** 会在手动选择器中打开一个场景。**Pick by hand**（或某条消息的 "More" 菜单，Story，"Save as a scene…"）会列出消息：点场景的第一条消息，再点最后一条，然后保存。已保存的场景显示为一行折叠的行，带有 **Take the mark off**。每个已保存的场景都会成为独立的一章，即使很短，也绝不会被折叠进它前面的场景。
- **事实**是一句保持为真的简短句子："Medli hides her wings at the market." 事实有类型、权重（Everyday、Important、Key）以及谁知道它。你可以手动添加、编辑、固定或停用事实。

**一个事实可以被整个群体知道**，例如一个公会：在 "Known to" 中输入 `group: Guild of Ravens`，场景中属于该群体的每个成员都知道它；其他人不知道。当一个卡片带有写成 `group: Guild of Ravens` 或 `faction: Guild of Ravens` 的标签时（其他标签不算群体），或者当一个 kind 为 Group 或 Place 的 World DM 记录列出了 Members 时，群体就存在（[[world-dm]]）。当某个成员在场景中时，写章节的模型会被告知该群体，并可能用它来记录整个群体得知的消息。快照书会在你保存的那一刻复制成员的名字。没有记录受众的事实（来自旧文件或导入）算作场景中的人都知道：某个角色说出的回复会在该角色在场景中时获得它，否则不会。
- **信念**是类型为 Belief 的事实：某个角色在被谎言告知后仍然当作真的事情。当谎言在 Dashboard 的 Said 列表里停留一段时间后，它就会出现，属于相信它的人，并且只进入那个角色的回复。当那个角色得知真相或你移除谎言时，它就结束；你也可以手动用 **Knows the truth now** 结束它，这也会告知 Dashboard。当某个信念进入回复时，Memory 视图会标记它。参见 [[dashboard]]。
- **转折点**是整个故事所依赖的事件：一次背叛、一次死亡、一个被遵守或违背的誓言、一个秘密的曝光、一个关上一扇门的选择。它不是事实：Litopys 几乎逐字保留它（两到四句话）在自己的列表中，所以合并和整理永远不会使它缩水。每一个都带有它触及的角色对它的感受，每人一行（"Bram: forgave Ada"）。只有当某个场景真的让故事发生转折时，Litopys 才会报告一个转折点；你标记为转折点的场景总是会得到一个。后来的转折点可以撤销先前的（先前的保留，标记为 "Undone by"），感受也可以后来改变。只有知道它的人才会得到它，和事实一样。一个复述场景中谎言的转折点会标记为 "Rests on a lie"：相信谎言的人把它读作平常的内容，其他人则被告知它不真实；它的菜单中有 **Not a lie**。转折点会进入这条链的每一个后续聊天室，无论远近（[[long-chats]]）。在 Library 的 **Turning points** 标签中，你可以添加一个、把某一章标记为转折点、编辑文本、感受和谁知道它、说明什么撤销了什么，或移除一个。如果 Litopys 想改变你写或编辑过的转折点，它会先问你。Litopys 自己发现的转折点在 Activity 标签中有 **Undo**，只要你还未编辑过它。
- **建议**是 Litopys 的提议：合并两个事实、停用一个、改写、固定。你逐个接受或拒绝。
- 一个角色明显表现出的**习惯**也可能出现，并在多个场景中重复后成为一个习惯。

## 在哪里查看

在聊天室标题栏中按 **Record**（在手机上，在 Menu 中）可在侧边面板中查看此聊天室的记录。侧栏的 **Library** 部分显示每个聊天室的记录。它有两个视图：Overview（时间线、每个角色一张卡片、等待中的建议）和 Details，带有 Chapters、Facts、Turning points、Proposals、Habits、Activity 和 Settings 标签。Activity 标签记录 Litopys 做了什么，尽可能带有 Undo。齿轮（"Litopys settings"）设置记录的写法。

## 早期聊天室的逐字记忆

章节是复述，所以一个小细节（斗篷的颜色、一个确切的承诺）可能在其中缺失。当此聊天室延续早期聊天室时（[[long-chats]]），**Word-for-word memories of earlier chats** 默认开启（Library，Litopys settings，"In the prompt" 块；如果你不想要它，可以在那里关掉）。然后，当正在说的内容与一段早期文本共享几个罕见词时，一到两段原始消息的文本会进入提示词，标记为比事实更旧。它会读取整条链，而不只是最近三个聊天室，并且一个角色只会得到该角色曾所在场景的文本。没有模型调用；不延续任何内容的聊天室什么也得不到，并且它最多占用 "Word-for-word budget" 个 token（默认 400）。如果没有任何内容共享足够多的罕见词，就什么也不添加。一个已结束聊天室的文本会在另一个聊天室接管它时（它进入 Archive 的那一刻）被索引，所以第一条回复不会等待它。它下面的一个实验性开关 **Also find old chapters by meaning** 让你的章节的向量（[[memory]]，Vectors 标签）打开一个含义与场景异常接近的旧章节；只有当该章节的文本也与正在说的内容共享一个罕见词时，才会添加它，所以仅凭含义永远不会添加任何内容。它默认关闭，需要嵌入模型，并且在短篇故事中不会打开任何内容（一个章节必须远高于所有章节的平均值）。Memory 视图和 Fired 面板列出上一条回复添加了什么，Fired 面板的整个聊天室视图统计了此聊天室中有多少条回复带回了文本；Canvas Prompt 面板对此聊天室有自己的开关。

## 什么会进入提示词

默认情况下记录会自动插入。"Memory size" 说明它可以占用多少 token：默认 Auto（模型窗口的 15%，至少 800，最多 16000）、Compact（800 token）或 Custom，从 200 到 16000。Auto 让大窗口承载更多故事；在小模型上它保持在 800 左右。你之前自己保存的大小保持原样。当一切都装得下时，全部都会发送；否则发送对场景最重要的部分。小模型想要小的大小。"Chapters and facts" 关闭意味着不产生新章节或事实，也不向提示词添加任何内容。

较旧的消息只有在窗口已满时才会离开提示词，或者在某个章节覆盖它们后逐个场景地离开；设置 "Older messages leave the prompt" 选择："Only when the window is full"（默认）或 "By scenes"。[[long-chats]] 说明该选哪个。

**私信，按大小。** 在 "Recent messages" 旁边（Library，Litopys settings；不在 "By scenes" 模式下）此设置默认为 0，意味着消息会被计数。一个 token 数量会保留能装进那么多 token 的最新消息，且至少 2 条，所以一个长回合和一句简短的话不再等重。它只是 Library 设置，不是单个聊天室的设置。

## 说话者不在场的内容

当一个角色回答时，模型默认不会得到该角色不在的场景中的最近消息。Dashboard 说明谁在场（[[dashboard]]）；你的消息与回答它的回复一起计数。一段被排除的消息会变成一行，例如 `[Bram was not here: 6 messages]`。如果角色离开后地点没有改变，这一行会说他们在听觉范围内，听到了人声和噪音，而不是话语。始终保留：角色自己的消息、最新的消息、Dashboard 没有数据的消息，以及当 Dashboard 从未列出该角色时的所有内容，所以不会凭猜测隐藏任何东西。

选择 **Leave out what a speaker was not present for**（Library，Litopys settings，"Recollections" 块）有三个选项："Groups only"（默认）、"Every chat" 和 "Off"。一个聊天室可以在 Canvas Prompt 面板中关掉它，项目为 "Messages a speaker was not present for"。它需要为该聊天室开启 Litopys 并开启 Dashboard，并且不适用于旁白回合、名单回合或 "write my line" 回合。Prompt 面板将每一行显示为名为 "Presence · N messages left out" 的部分。

## 导入聊天记录

在角色的 Chat files 对话框中按 **Import chat**，或按 **Paste a chat log** 粘贴文本。除了 JSONL 文件（和以前一样导入）外，它还接受纯文本日志：每条消息一行 "Name: what they said"，没有标签的行延续上一条消息，名字前的时间或加粗的名字都可以。文本最多可达 400 万个字符。

对话框会显示它找到了多少条消息和说话者。在 **You are** 中选择哪个说话者是你，并设置 **Chat title**。**Write the story memory (Litopys) for this chat** 框默认开启：它大约每个最多 40 条消息的场景消耗一次模型调用，并在 Litopys 模型上后台运行。如果你清除它，聊天室会在没有记忆的情况下导入；之后在 Canvas Prompt 面板中为它开启 Litopys。导入不会构建 Dashboard：谁在场以及在哪里会一直为空，直到故事继续，所以上面的在场裁剪对导入的部分没有依据。

## 按含义匹配

Memory 按词语查找事实和章节。有了嵌入模型，它也会按含义查找它们：用其他措辞提出的问题仍然能到达那个事实。卡片 **Matching by meaning**（在聊天室记录的顶部，以及 Canvas > Prompt > Memory 中）显示它的状态：关闭、失败、还没有向量、部分完成、完成，或由另一个模型生成。向量留在生成它们的设备上，不会同步（章节、事实和其他所有内容会同步），所以一台电脑和一部手机可以使用不同的模型；还没有向量的设备会自己生成，自动或通过按钮。在 Settings > Memory 中设置一次模型：默认情况下，应用先使用你自己电脑上的模型（LM Studio 或 Ollama），然后是有密钥的 API 连接，然后是 OpenRouter。一旦对嵌入模型的一次调用成功（按一下卡片上的按钮，或一次回复），引擎会自己填充每个聊天室和 Data Bank 文件缺失的向量，每隔几分钟查看一次；任何超过 300,000 token 的内容会等待按钮，Settings > Memory 中的开关 **Make vectors by itself** 可以关掉它。按钮 **Embed N items** 会先说明有多少项以及大约需要多少 token，然后立即执行。新场景无论如何都会嵌入它们的新项。如果你更改嵌入模型，旧向量在你按 **Embed again** 之前不会被使用。Data Bank 有自己的卡片 **Data Bank by meaning**，在 Settings > Data Bank 的顶部：它对你的文件和快照书的文本以相同方式工作，一个只被部分覆盖的文件会显示 "7 of 12 by meaning"。

## 单个聊天室的设置

聊天室记录的 **Settings** 标签（在 Record 侧边面板和 Library 中，Activity 旁边）单独为这个聊天室设置 Litopys：最短和最长的场景、多少条最近消息逐字保留（或者，当较旧消息按 "By scenes" 离开时，场景之后保留多少条私信）、较旧消息离开提示词的方式，以及一个角色可以固定多少条事实。留空的字段会遵循齿轮的 "Litopys settings" 并显示该值为 "Library: N"。离开字段时会保存值。"Use the Library settings" 会清除它们全部。**Look for scenes by itself**（Scenes 卡片和此标签中的开关；默认关闭，仅此聊天室）让 worker 无需被要求就做 **Suggest scenes** 做的事：一旦 20 条或更多消息不属于任何场景，它就会读取它们，每 40 条一次请求，并把提议的场景留在 Scenes 卡片中（"Scenes found by itself: N"）供你查看。它自己从不保存场景，会等到你处理完列表，并且只在再有 20 条消息后才再次询问。场景变化频繁的聊天室适合较低的最短场景，比如 3：短场景然后会有自己的章节。已写好的章节保持原样；用 Rebuild 以新的长度重写它们。

## 建议与整理

"Suggestions" 有三个选项。"Ask me first"：每个建议都等待你的同意。"Only risky ones"（新安装的默认值）：常规建议立即应用，记录在 Activity 中并带有 Undo，只有有风险的建议等待，每个都附有理由：一次合并会把只有一些人知道的事实告诉更多人，一次对你固定、写过、编辑过或标记为关键的事实的更改，一次持久更改或一个信念，以及一个新事实可能与你固定的事实矛盾。同样的理由会显示在 Inbox 中。"Apply pins and rewrites quietly"：只有固定和改写会通过；停用和合并等待你。"Tidy facts automatically" 在 30 条新事实后查找重复和矛盾，每 60 条事实额外一次模型调用。

## 重建

"Rebuild from scratch" 在后台从消息重写章节和事实，大约每 30 秒一次模型调用。你自己的、编辑过的和固定的事实以及编辑过的章节保持不变，并且在新记录准备好之前使用当前记录。如果没有场景已关闭，它会拒绝启动。

如果你在章节写好后编辑消息，该章节会被标记为过期并重写。

## 相关

角色的卡片也可以保存已结束聊天室的记忆：参见 [[memory]]。帮助文章 *Litopys: chapters and proposals*、*Facts and proposals* 和 *Overview vs Details* 介绍了这些界面。

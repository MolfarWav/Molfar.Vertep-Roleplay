<!-- source: 67addd68fb05 -->
# 长聊天与 token 开销

一个持续数周的聊天会不断增长，每条回复都会把更多内容发给模型。如果你的回复变慢或变贵，或者模型忘记了故事的开头，这一页就是为你准备的。

## Request size 按钮

默认情况下，只要窗口还有空间，整个聊天都会被发送。窗口很大时，开销会持续增长，所以聊天标题栏在故事工具旁边有一个 **Request size** 按钮（在手机上：在 Menu 里）。它会显示上一次请求发送了多少 token、服务商统计的整个 prompt，以及是哪个模型收到的。按下它可以看到模型、它的窗口和你的上限。低于上限四分之三时是青色，从那里开始是琥珀色，超过后是红色并带警告标志。Canvas Prompt 面板会列出一次请求的每个部分（[[canvas]]）。

当一条回复让请求超过上限时，会弹出一个窗口：

- **Yes, continue in a new chat** 会立刻创建下一个聊天并打开它。
- **Not now** 会在这个聊天里隐藏弹窗，直到请求又增长了半倍。关闭它算作 Not now。
- **Send finished scenes as chapters instead** 在 Litopys 开启时出现（下一节）。

上限在弹窗底部，也在 Library、齿轮 "Litopys settings"、区块 "In the prompt"、"Warn me when a request gets big" 里：模型窗口的 60%（默认）、你输入的大小（100k）或选择的大小（16k 到 500k），或者从不。已经超过上限的聊天会显示红色按钮，并且不再弹窗，直到新回复让它继续增长。

记录也有自己的大小。在同一个区块里，"Memory size" 默认是 Auto：模型窗口的 15%，在 800 到 16000 token 之间。"Compact" 会把它保持在 800。

## 削减开销的开关

在同一个区块里，"Older messages leave the prompt" 有两个选项：

- **Only when the window is full**（默认）：只要放得下，每条消息都会发送。
- **By scenes**：一旦某一章包含了一个场景，这个场景就会被这一章替换。只有最后几条消息保持逐字发送（"Direct messages after the scenes"，2 条或更多）。最新的场景还没有对应的章，所以会完整发送。

"By scenes" 会损失一些细节：一章是复述，所以较弱的模型可能会丢掉小东西。把绝不能丢失的事实钉住（[[litopys]]）。其他削减方式：

- Library、Litopys settings、**Direct messages, by size**：保留能放进一定 token 数的最新消息（至少 2 条消息），而不是固定条数。0 表示按消息计数（[[litopys]]）。
- Library、Litopys settings、**Leave out what a speaker was not present for**（默认 "Groups only"）：某个角色说出的回复不会带上该角色不在场的场景中的近期消息（[[litopys]]）。
- Canvas Prompt 面板、history 卡片、Details：只发送最后 N 条消息（桌面端，仅该聊天）。
- 把 "Memory size" 降到 Compact，或者关闭 "Chapters and facts"。

## 开启新聊天并保留故事

在自然的停顿处，一个延续旧聊天的新聊天会以很小的 prompt 开始，并且仍然知道发生了什么。

1. 在聊天中打开 "More" 并选择 **Continue in a new chat**，或者在弹窗中按 Yes。
2. 新聊天会立刻创建并打开。它会保留预设及其选择、persona、模型、agent 集合、群聊的发言顺序以及 World DM 世界。
3. 它会得到旧故事作为 backstory，在 "Backstory budget" 范围内。最近的三个更早聊天会被完整读取：章节、事实和转折点。长链条中更早的聊天不会被丢掉：它们会搭在一个压缩部分里（见下文）。旧消息不会被发送。

较早的聊天随后会自行移到 Archive（下一节）。这个链接就是 Canvas 画出的那个，Canvas 之后可以更改它：见 [[canvas]]。要选择另一个更早的聊天，从角色开始一个新聊天，并在 "New chat with" 步骤使用 **Continues** 菜单。

新聊天会以卡片的第一个问候语打开；"Edit the first message" 让你从故事停下的地方继续。

## 由许多聊天组成的故事

一个故事可以延续许多个聊天。最近的三个更早聊天会像之前一样提供它们的章节、故事线和事实。每个更早的聊天都会进入一个 **far** 部分，放在最前面：它的转折点、钉住的关键事实，以及每条故事线的一行。这个部分由 Litopys 已经写好的内容构建，不需要额外的模型调用，默认占 Backstory budget 的 18%（Library、Litopys settings、"In the prompt"、**Share for the far chats**，5 到 40）。同一区块里的 **Turning points shown** 设置整个故事中有多少转折点会随回复发送（默认 12）。如果预算不够，最旧的聊天会先失去它们的行，转折点最后失去。在 **What this chat carries** 中，它有自己的行，"Far backstory, chats 1-2"，这样你可以看到最早的聊天被保留了，而不是丢失了。短链条没有 far 部分。如果长故事感觉太单薄，就提高 Backstory budget。

压缩部分会丢掉小细节（比如斗篷的颜色）；下面逐字保留的记忆会把它们带回来。

## 归档一个已完成的故事

你已经完成的故事可以进入 **Archive**。这是聊天的一种状态，不是移动：聊天会留在原地，所以它的记忆、它在 Canvas 上的链接以及由它制作的任何书都继续有效。

- 在 Chats 中，选择一个聊天并按 **Archive**（它面板里的琥珀色按钮），或者用 Select 勾选多个。在聊天中，它在 "Manage chat" 下的菜单里。
- 已归档的聊天会离开列表和 Home。筛选器下方的琥珀色 **Archive** 行会打开它们；**Back to chats** 返回。
- 它以只读方式打开：你可以阅读、复制、从某条消息分支、导出，并查看它的 Dashboard 和 Library，但不能发送、滑动、编辑或删除。它底部的位置提供 **Continue in a new chat**。**Unarchive**（在它的面板或横幅中）会让它恢复正常。
- 当还没有聊天延续这个聊天时，确认框会提供 **Archive and continue**。
- **它会自行发生**：当一个聊天成为另一个聊天的较早聊天时——Canvas 上的链接、Continue in a new chat、上面的弹窗，或 "Continues" 中的选择。会有一个带 Undo 的提示说明这一点。分支不是延续，会保持原样。可以在 Library、齿轮 "Litopys settings"、"Archive the earlier chat when it is continued" 中关闭它。
- 一个有 100 条或更多消息、并且已经安静了一周的聊天，会在列表中得到一个小标签 "Long chat · archive?"，并在它的面板中有一条提示。不会替你归档任何东西。

为什么要这样做：较早的聊天不再变化，所以它的记忆保持稳定，而延续它的新聊天会把它当作一个已完成的故事来读取（[[litopys]]）。

## 章节丢掉的细节

一章是复述，所以较早聊天中的一个小细节可能会从中消失。在 Library、Litopys settings、"In the prompt" 中，开关 **Word-for-word memories of earlier chats**（默认开启）让一个延续其他聊天的聊天，在当前所说的内容与原始消息共享罕见词时，带回一两段原始消息（[[litopys]]）。较早的聊天在进入 Archive 时会被索引。它匹配词语，所以用其他说法讲述的细节找不到；实验性开关 **Also find old chapters by meaning**（关闭）在你使用 embeddings 时会稍微缩小这个差距：它按含义找到章节，但一段文字仍然需要它自己的一个罕见词。

## 把故事保存为一本书

在 Library、Litopys、"Save as a book" 中，会把你选择的聊天的章节、故事线和事实复制到 Data Bank 书架上：见 [[memory]]。

## 查看模型收到了什么

如果某个角色忘记了什么，打开 Canvas > Prompt，并从 "Parts" 切换到 "Memory"：它会显示哪些事实进入了、哪些被排除，以及原因。聊天标题栏中的 **Fired** 按钮会显示上一条回复以及整个聊天的情况。

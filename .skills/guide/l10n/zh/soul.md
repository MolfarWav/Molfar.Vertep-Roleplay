<!-- source: e0c72ba92f2d -->
# 角色的Soul

Soul是角色对你的性情：故事开始时他们如何对待你，每种感觉增长的速度，以及什么会更伤害或取悦他们。它是Dashboard关系数字的输入（[[dashboard]]）。如果你想让角色以自己的方式做出反应，或者想知道为什么会出现提议，就需要本页。

## Soul包含什么

类别（romantic、ally、neutral或hostile）、代词、信任、舒适、吸引、尊重和喜爱的起始值（从-20到+20；0代表陌生人）、特质（dominance、confidence、shyness、patience、curiosity）、影响感觉增长速度的光谱、触发因素和价值观（影响更大或更令人愉悦的事物）、一句关于压力下如何应对的话，以及角色的其他名字。帮助文章*Soul of a character*解释了每个字段。

Soul不存储故事中发生的事情。它在游玩过程中从不改变；Dashboard为每个聊天保存不断变化的数字。没有Soul的角色只会以中性方式表现，所有乘数为1，起始值为0。

## 在哪里编辑

打开卡片，然后打开**Soul**标签页。每个角色都是顶部的一个标签：单角色卡片有一个标签，叙述者卡每个常驻角色各有一个标签。选择一个标签并编辑其字段，然后按“Save soul”。已保存的特质和光谱是固定的；“Edit”会解锁它们，标签页会警告更改会影响此卡片的每个聊天中的后续回合。“Delete soul”位于“More actions”菜单中。“Add”或“Add by hand”可自己为某个名字创建Soul。

只有主要角色会获得Soul。故事中临时出现的路人则有意不予设置。

## 自动评分与提议

默认情况下，应用会为没有Soul的卡片提议一个Soul：在导入后立即进行，并在聊天的首次Dashboard更新时进行。模型会读取卡片、设定集和近期消息。提议不会保存到卡片中。横幅会显示“Proposal (automatic)”，以及“Review”“Accept all”和“Dismiss”；或对单个角色显示“Save soul”。在你做出决定之前，提议会作为临时Soul在游玩中生效。“Dismiss”会停止此卡片的自动评分。如果评分失败，横幅会显示“Retry”和“Choose another model”。待处理的提议也会出现在Inbox中。

## 我可以在页面上重新评分吗？

可以，使用同一个按钮。Soul标签页中的那一个评分按钮会根据所选内容改变标签：

- 未选择角色，或选中的角色尚未保存Soul时：“Rate now”。它只会为没有Soul的角色评分；如果没有剩余角色，则只会提示没有新内容。为尚无Soul的角色评分也可以通过“Rate this character”完成。
- 选中的角色已有保存的Soul时：“Rate again”。它会请求模型为该角色生成一个新的Soul，并作为更新显示在已保存Soul旁边供你审阅。如果你有未保存的编辑，它会先询问“Rate again?”，因为这些编辑将被替换。如果新评分与已保存的Soul相同，则会提示没有需要更改的内容。

在你按“Save soul”之前，不会覆盖任何内容。使用的模型是Dashboard的“Sensor model”（如果为空则使用聊天模型）；Dashboard设置中的“Rate characters automatically”开关只控制自动首次评分，而不是此按钮。

你也可以在Molfar自己的聊天中让它评分或调整Soul；它会生成同样类型的提议（[[vertep:molfar]]）。

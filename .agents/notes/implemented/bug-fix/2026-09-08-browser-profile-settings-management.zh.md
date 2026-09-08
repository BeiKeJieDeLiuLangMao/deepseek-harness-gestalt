# Agent Note: Browser Profile 设置管理

Status: implemented

[English](2026-09-08-browser-profile-settings-management.md) | 中文

## Problem

浏览器设置分区把每种身份显示成纵向单选项，把每个 Profile 名称持续放在可编辑输入框里，并把 Profile 创建表单内联在名册下方。整个表单因此松散，常用的阅读状态看起来仍可直接编辑，新增草稿也一直占用页面布局。

## Decision

默认身份使用一个紧凑选择卡片。命名持久 Profile 使用展示行，并提供显式重命名与删除操作。Profile 创建复用共享的 `Modal`、`Input` 与 `Button` primitive；每条关闭路径都会清空草稿，并把焦点还给“添加 Profile”触发按钮。Escape 只关闭创建弹层，父级设置页保持打开。

设置存储继续持有名册与默认身份。重命名已选中的持久 Profile 会同步更新默认项，删除它会清空默认项，持久名称选择器仍位于身份卡片内。设置 schema 与 Browser Profile partition 语义均不改变。

## Alternatives considered

**只调整现有内联控件的样式。** 否决，因为持续显示的文本输入框仍会把名册呈现成编辑表单，未使用时创建表单也会继续占用页面空间。

**修改共享 Modal 的 Escape 行为。** 否决，因为只有这个嵌套弹层需要保留父级设置页；其他 Modal owner 拥有各自的父层行为。

## Consequences

该分区的阅读状态更加紧凑，新增与重命名仍是显式且支持键盘的流程。浏览器 owner 增加少量本地草稿与焦点状态。组件测试覆盖新增成功、取消、嵌套 Escape、校验、显式重命名与删除；设置 owner 测试覆盖持久名册与默认持久身份更新。

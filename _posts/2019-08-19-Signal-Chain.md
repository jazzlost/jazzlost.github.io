---
layout: post
title: "音频系统信号流"
subtitle: "Signal Chains Of Three Audio System"
author: "李AA"
header-img: "img/blog-bg-deep.jpeg"
tags:
    - Wwise
    - FMOD
    - Unreal
---

# 前言
* 三个音频系统信号链的简单图示，力求简洁的表示信号流程以及涉及信号链的对象模块。因为系统信号流有组合性质，所以存在图示以外的信号流程，图示只是可能性的一种。

# FMOD

![](/img/in-post/SignalChain/FMOD.GIF)

# Wwise

![](/img/in-post/SignalChain/Wwise.GIF)

# Unreal Engine
* 基于4.17版本新声音引擎,本文基于4.21版本，部分功能还没开发完整

![](/img/in-post/SignalChain/Unreal.GIF)

# 总结
* 通过信号链可以大概看出音频系统的设计流程。存在越多信号组合性，信号流系统也会越复杂，所以每个系统都有固定的子模块来限制信号流。过于自由的路由组合，在没有妥善管理下，对于项目混音来说可能是灾难。使用明确简洁而统一的信号流是提高后期混音效率的前提，也可以更容易排查信号错误。
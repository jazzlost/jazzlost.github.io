---
layout: post
title: "SideChain和AutoDuck在Wwise中的使用"
subtitle: "Some Tips About Compression In Wwise"
author: "李AA"
header-img: "img/post-bg-music-header_745px.jpg"
tags:
    - Wwise
    - Audio
---

* TOC
{:toc}

# 前言
* Q: 本文主题
* 介绍两种最常用的```Wwsie Authoring Tools端```的侧链压缩方法，之后会更新一些引擎端的侧链压缩方法。

# RTPC实现SideChain
1. 创建```Game Parameter```来关联输出电平值。取-48-0dB即可，这里不需要调整插值选项来平滑启动，可在后面步骤调整。

    ![](/img/in-post/SideChain&AutoDuckInWwise/SC1.png)

2. 在侧链信号输入端对象上插入```Wwise Meter```效果器，用来关联输出信号和Game Parameter。这里可以根据需求选择电平模式，一般是用RMS,然后通过Attack/Hold/Release来平滑电平对Game Parameter的映射。Output Game Paramter选择刚才创建的Game Parameter,两边值域同步。

    ![](/img/in-post/SideChain&AutoDuckInWwise/SC2.png)

3. 关联Game Parameter和侧链输出端被调制对象的音量。在被调至对象的RTPC页面创建新的RTPC，Y轴用此对象Voice Volume(RTPC关联中尽量少用Bus Volume以免后期Gain Stage混乱)，X轴用我们创建的Game Parameter。然后在音量曲线上画出想要的压缩效果即可。

    ![](/img/in-post/SideChain&AutoDuckInWwise/SC3.png)

4. 整个设计的思路就是把一个对象的输出电平通过Game Parameter和另一个对象的音量关联起来。最后需要自己画出压缩曲线。

# Auto Ducking
1. Wwise内置的ducking只能用于```Bus```组，用于bus信号之间的duck。选择任意bus的Auto-Ducking Tab，选择duck对象，可以调节最大压缩音量，fade曲线模式和时间。注意这里volume是被侧链压缩bus的音量，Maximum ducking volume是本bus可以被侧脸衰减的最大值。

    ![](/img/in-post/SideChain&AutoDuckInWwise/SC4.png)

# 总结
* 以上只是Wwise Authoring Tools中最长用到的两种侧链压缩手法，也是官方推荐的方式。配合RTPC和各种效果器链组合可以在引擎端也创造多种的侧链技术。
---
layout: post
title: "FPS项目声音优化方案"
subtitle: "Optimization Of A FPS Project"
author: "李AA"
header-img: "img/blog-bg-grass.jpeg"
tags:
    - Wwise
    - Unreal
---

* TOC
{:toc}


# 前言
* 从去年开始的项目目标是支持32人同时在线FPS游戏。前期构建声音框架阶段没有做优化设计，再后续的多个版本中开始出现声音资源消耗过大情况，所以进行了一系列的优化方案，在此记录讨论。

# 优化细节
* ## 组件逻辑业务优化
  * 保证接口的鲁棒性，对传入对象的有效性和传入值的边界条件进行检查。对于多次使用对象，在第一次取得时进行保存。
    ![](/img/in-post/FPSOptimization/ValidCheck.PNG)
  * 保证单一职责的接口。对于功能复杂模块，细化需求进行模块拆分。在枪声组件部分，我把不同功能的需求部分拆成了细化的模块
    * 武器状态选择模块
    * 武器状态切换模块
    * 第一发射击声模块
    * 枪声尾巴模块
    * 子弹掉落模块
  * 用Interface来解耦非音频模块
    * 将常用接口或易变动接口用Interface包装后提供给项目组调用
    
    ![](/img/in-post/FPSOptimization/ISoundManager.PNG)
    
    ![](/img/in-post/FPSOptimization/ISoundManager02.PNG)

* ## Component数量优化
  * 静态的组件挂在对象上存在一个生命周期和对象一样长的资源占用，对于一些声音，可以选择用即播即销毁事件```(SpawnAkComponent)```来播放声音，总结了一下大概有下面几类
    * UI
    * 子弹击中声
    * 手榴弹等投掷类武器声音
    * 人物非移动类动作声音(捡物品，使用物品...)
  * 常用的算法可以写在```BlueprintFunctionLibrary```中，全局对象都可以调用
    
    ![](/img/in-post/FPSOptimization/BPFunctionLibrary.PNG) 

  * 使用```SoundManager单例```来播放2D全局声音
    
    ![](/img/in-post/FPSOptimization/SoundManager.PNG)

* ## Tick优化
  * Tick业务在60FPS下基本是0.017s更新一次，明显很多操作不需要Tick级别的更新，所以用```Timer```替换，我们替换的业务主要是下面几项：
    * 地面材质的检查。人物最快速动作间隔0.2s,把Timer设置为0.15s。

    * 集成的实现中```UpdateGameObjectPosition()```在每个Tick都会遍历ComponentList,在ComponentList数量很大时会消耗大量时间，这个也是性能热点

    ```cpp
    void UAkComponent::UpdateGameObjectPosition()
    {
    #ifdef _DEBUG
    	CheckEmitterListenerConsistancy();
    #endif
    	FAkAudioDevice* AkAudioDevice = FAkAudioDevice::Get();
    	if (bIsActive && AkAudioDevice)
    	{
    		if (AllowAudioPlayback())
    		{
    			UpdateSpatialAudioRoom(GetComponentLocation());

    			AkSoundPosition soundpos;
    			FVector Location, Front, Up;
    			UAkComponentUtils::GetLocationFrontUp(this, Location, Front, Up);
    			FAkAudioDevice::FVectorsToAKTransform(Location, Front, Up, soundpos);
    			AkAudioDevice->SetPosition(this, soundpos);
    			CurrentSoundPosition = soundpos;
    		}

    		// Find and apply all AkReverbVolumes at this location
        // 这个操作在实际情况下不需要如此精度的更新，所以可以把功能拿出来用timer更新
    		if (bUseReverbVolumes && AkAudioDevice->GetMaxAuxBus() > 0)
    		{
    			UpdateAkLateReverbComponentList(GetComponentLocation());
    		}
    	}
    }

    //-----------------------------------用timer替换-----------------------------------
    void UAkComponent::BeginPlay()
    {
    	Super::BeginPlay();

    	UpdateGameObjectPosition();

    	// If spawned inside AkReverbVolume(s), we do not want the fade in effect to kick in.
    	UpdateAkLateReverbComponentList(GetComponentLocation());
    	for (auto& ReverbFadeControl : ReverbFadeControls)
    		ReverbFadeControl.ForceCurrentToTargetValue();

    	SetAttenuationScalingFactor(AttenuationScalingFactor);

    	//TODO:Wwise
    	if (!(GameObjectPositionByTimerHandle.IsValid()))
    	{
    		GetWorld()->GetTimerManager().SetTimer(GameObjectPositionByTimerHandle, this, &UAkComponent::UpdateGameObjectPositionByTimer, 0.02, true);
    	}
    	else
    	{
    		GetWorld()->GetTimerManager().ClearTimer(GameObjectPositionByTimerHandle);
    	}
    }

    void UAkComponent::UpdateGameObjectPositionByTimer()
    {
    	FAkAudioDevice* AkAudioDevice = FAkAudioDevice::Get();
    	if (bIsActive && AkAudioDevice)
    	{
    		if (AllowAudioPlayback())
    		{
    			//TODO:Wwise
    			UpdateSpatialAudioRoom(GetComponentLocation());

    			AkSoundPosition soundpos;
    			FVector Location, Front, Up;
    			UAkComponentUtils::GetLocationFrontUp(this, Location, Front, Up);
    			FAkAudioDevice::FVectorsToAKTransform(Location, Front, Up, soundpos);
    			AkAudioDevice->SetPosition(this, soundpos);
    			CurrentSoundPosition = soundpos;
    		}
    	}
    }
    ``` 
    * Component Update调用栈
    
    ![](/img/in-post/FPSOptimization/CallStack.PNG)

* ## 服务器端优化
  * 保证所有声音在本地播放，对于服务器Spawned对象，通过单独声音播放接口
  
  ![](/img/in-post/FPSOptimization/TickOnServe.PNG)
  
  ![](/img/in-post/FPSOptimization/Replicate.PNG)
  
  ![](/img/in-post/FPSOptimization/Authority.PNG)
  
  ![](/img/in-post/FPSOptimization/MulticastInterface.PNG)
  
  ![](/img/in-post/FPSOptimization/Multicast.PNG)
  
  * 对象静态的组件无论标注与否都是```默认Replicated```，所以改用```动态加载```组件，可以放在类的构造脚本中
  
  ![](/img/in-post/FPSOptimization/ConstructAkComponent.PNG)
  
* ## Wwise工程端优化
  * Wwise端限制声音实例数量，主要下列几项
    * 枪声
    * 脚步声
    * 人物衣服声
    * UI
  
  ![](/img/in-post/FPSOptimization/PlaybackLimit.PNG)
  
  * Wwise端增加Event细粒度，减少Switch的层级
    * 通过把嵌套switch拆分为几个独立的switch，分别赋予event来触发，项目中主要是把非枪武器声和人物一些特殊动作声拆分为独立Event。
  
  * 由于项目对于声音文件体积限制宽松，所以素材一律使用了PCM编码，减小编解码资源占用。
  
  ![](/img/in-post/FPSOptimization/Conversion.PNG)

  # 总结
  涉及服务器通讯的游戏，在优化时需要格外注意服务器端的调试，确保没有声音对象出现，对于需要服务器广播的数据或者功能，需要尽量高的空间时间效率，所以业务代码上需要做一些算法上的精简。对于集成部分也要按需优化，最终达到项目组的要求。
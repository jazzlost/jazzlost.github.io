---
layout: post
title: "FPS项目声音设计框架"
subtitle: "Sound Framework Of A FPS Project"
author: "李AA"
header-img: "img/blog-bg-stella.jpg"
tags:
    - Wwise
    - Unreal
---

* TOC
{:toc}


# 前言
* 此项目是一个支持32人同场竞技的FPS团队竞赛类游戏。音频部分工作重点是枪声和声学空间塑造，力求突出音效对各种空间参数的敏感与真实性。

* AudioFramework

![](/img/in-post/FPSProject/Mermaid.PNG)

# 武器
* 资源层级
* 枪
  * 声音对象距离(close, mid, far)
    * 第一/第三人称(FP, TP)
      * 室内/室外(indoor, outdoor)
        * 武器状态(fire, reload, stop...)
          * 具体武器种类(AKM, M249, M4...)
* 击中声
  * 材质分类
* 其他武器  

## 声音对象距离
![](/img/in-post/FPSProject/Distance.PNG)

* 用引擎端传来的声音对象间距离来做枪的第一层级，三个距离区间不同素材，不同空间化设置。

## 第一/第三人称
![](/img/in-post/FPSProject/PlayGunInterface.PNG)
* 引擎端判断对象人称属性，切换FP/TP层级，两套资源

## 室内/室外
![](/img/in-post/FPSProject/室内外切换.PNG)
* 室内室外某些状态的资源有区别，这里室内外我们用了自定义的Spatial Volume来检测，详见[空间](#%e7%a9%ba%e9%97%b4)

## 武器状态和具体武器种类
* 所有武器相关模块都用自定义AkComponent，武器的特别需求有第一/第三人称区别，室内室外区别，连发枪第一发和后面发资源不同，有弹壳掉落声，连发枪停止射击时不能马上中断，需要播完整资源。

* 状态模块选择
  * 通过一组枚举表来管理复杂状态量

![](/img/in-post/FPSProject/WeaponSwitch.PNG)
* 状态切换
  * 状态切换主要是判断第一次按下鼠标键的时间，然后触发连发枪第一枪模块和总的状态切换模块。最后PostEvent还有一个回调用来触发连发枪尾音模块

![](/img/in-post/FPSProject/StateSwitch.PNG)
* 连发枪第一发模块
  * 通过上个模块判断的按下鼠标的时长来判断是点射还是连发

![](/img/in-post/FPSProject/FirstShot.PNG)
* 连发枪尾音模块
  * 因为Loop资源的特殊性，连发枪在通知上也是只有两次(开始/停止)，所以只能通过增加一个射击声尾巴资源来增加真实性，这里主要是判断是否是连射结束，然后播放资源，资源提前打上Marker标记

![](/img/in-post/FPSProject/Tail.PNG)
* 子弹掉落声模块
  * 如果是连发枪，因为只有两次通知(开始/停止)，所以需要自己模拟掉落Loop,通过一张Map来维护Loop时间间隔。
  
![](/img/in-post/FPSProject/BulletDrop.PNG)


## 单事件设计
* 枪部分是整个项目资源量最大，层级最深的部分。我们使用了单事件的模式，只暴露了一个Play_Guns事件给引擎端，所有层级切换使用switch的配合完成。这样的设计优点是减少事件的数量便于在引擎端的管理，缺点是调用层级复杂，需要良好的switch管理。

* 对于这种单事件的设计，需要注意的是每个事件实例同一时间只播放一个声音资源，若声音间有重叠的需要(比如射击的回响声和换弹夹的声音可能同时出现)，则需要多个事件实例，在引擎端表现为多个声音组件。

# 人物
* 人物声音模块因为项目问题，拆分为动画相关的和控制相关，所有声音播放还是通过挂在人物身上自定义AkComponent。

* 人物
  * 移动声音
    * 具体移动状态(Walk, Run, Jump...) 
  * 背包声音
    * 具体移动状态(Walk, Run, Jump...) 
  * 衣服声音 
    * 具体移动状态(Walk, Run, Jump...)


## 动画关联
* 和动画关联的声音通过自定义AnimNotify的方式来触发。

* 编辑器声音播放模块

![](/img/in-post/FPSProject/AnimNotifyEditor.PNG)

* Gameplay声音模块

![](/img/in-post/FPSProject/AnimNotifyGameplay.PNG)

* 无效数据检查模块

![](/img/in-post/FPSProject/AnimNotifyInvalidCatch.PNG)

* 还有一部分中间动作状态的通过动作状态机上的Event来出发

![](/img/in-post/FPSProject/ABP_Event.PNG)

## 控制关联
* 人物走路，跑步，跳跃等一系列动作可以通过绑定MovementComponent通过移动时的参数来调用，素材需要调整为loop

![](/img/in-post/FPSProject/ControlAnim.PNG)

## 材质区分
* 通过一组接口来进行材质的区分与相应资源的切换,这里方案用的是LineTrace，具体测试时在楼梯等镂空地方LineTrace会有检测失误，所以在有材质镂空的地方需要再进行标记

![](/img/in-post/FPSProject/SurfaceDetect.PNG)

# 空间
* 空间上，因为我们需求是单一Box同时满足TriggerBox和Spatial Audio Volume的功能。但是测试中发现AVolume类在碰撞检测时会有阻塞，在SetSwitch时会有较大卡壳。反之AkLateReverbComponent和AkRoomComponent组件只能挂在AVolume类对象上，TriggerBox的父类是AActor不满足要求，所以进行了AkReverbComponent和AkRoomComponent的重定义，使其满足可以挂在TriggerBox类上。

![](/img/in-post/FPSProject/AudioSpatialVolumeComponent.PNG)

```cpp
//之所以只能挂在AVolume类上是因为依赖了AVolume的这个功能
bool UAkLateReverbComponent::HasEffectOnLocation(const FVector& Location) const
{
	// Need to add a small radius, because on the Mac, EncompassesPoint returns false if
	// Location is exactly equal to the Volume's location
	static float RADIUS = 0.01f;
	return LateReverbIsActive() && ParentVolume->EncompassesPoint(Location, RADIUS);
}

//这个是改写了可以支持TriggerBox的EncompassesPoint功能
bool UAkLateReverbComponent::EncompassesPoint(FVector Point, float SphereRadius, float* OutDistanceToPoint) const
{
	auto shapeComp = TriggerActor->GetCollisionComponent();

	if (nullptr != shapeComp)
	{
		FVector ClosestPoint;
		float DistanceSqr;
		if (false == shapeComp->GetSquaredDistanceToCollision(Point, DistanceSqr, ClosestPoint))
		{
			if (OutDistanceToPoint)
			{
				*OutDistanceToPoint = -1.f;
			}
		}

		if (OutDistanceToPoint)
		{
			*OutDistanceToPoint = FMath::Sqrt(DistanceSqr);
		}

		return DistanceSqr >= 0.f && DistanceSqr <= FMath::Square(SphereRadius);
	}
	
	else
	{
		//UE_LOG(AkLateReverbComponent, Log, TEXT("AkLateReverbComponent::EncompassesPoint : No TriggerActor"));
		return false;
	}
}

//然后再修改几个对Parent对象类型进行检查的地方就可以了
void UAkLateReverbComponent::InitializeParentVolume()
{
	ParentVolume = Cast<AVolume>(GetOwner());
	//这里
  if (!ParentVolume)
	{
		bEnable = false;
		UE_LOG(LogAkAudio, Error, TEXT("UAkLateReverbComponent requires to be attached to an actor inheriting from AVolume."));
	}
}
```

# UI
* UI资源创作因为是多人协作，而且存在后期修改可能，所以选用了用DataTable获取数据的方式

![](/img/in-post/FPSProject/UIDataTable.PNG)

* 在Widget中用这个接口来配置，之后有任何修改，只需要在DataTable中进行

![](/img/in-post/FPSProject/UIDataTableInterface.PNG)

# 环境声
* 使用单例SoundManager来管理所有2D类资源播放

![](/img/in-post/FPSProject/SoundManager.PNG)

# 单元测试用例
* 游戏需要运行在专用服务器上，而且需要固定人数才能匹配，所以开发环境下需要一个可以模拟第三人称的测试用例,测试用例要可以播放人物身上的所有声音已经可以移动。
  
* 控制模块

![](/img/in-post/FPSProject/UnitTestControl.PNG)

* 事件模块

![](/img/in-post/FPSProject/UnitTestEvent.PNG)

# 总结
* 整个项目工作量主要集中在枪声和空间组件的设计上，对于单事件的设计在后期需求变化增多时也出现了缺陷，需要用补充事件来进行完善。地图内因为存在大量建筑，所以就有大量的空间组件，空间组件的优化也成了最重要一部分，这个我会另写文章讨论。

---
layout:     post
title:      "Wwise Game Object"
subtitle:   " \"Hello World, Hello Blog\""
date:       2019-03-29 12:00:00
author:     "AA"
header-img: "img/post-bg-2015.jpg"
catalog: true
tags:
    - Wwise
    - Unreal
---






# Game Object
* <font size =4> Q: 什么是Game Object？</font>
* A: Game Object没有固定的定义，在每款引擎甚至中间件内都有区别。不过总体意思相差不多，可以理解为对象，也就是需要实例化使用的具体类。
* Unity中GameObject被简单抽象为需要放入场景实例化的“东西”。
* UE4则具体化为AActor类及其子类，AActor类也是唯一能够在UWorld类中被Spawned的类型。所以简单来说所有可以被放到level map中的都属于Actor类(大多数情况下都不单是Actor类)。
* 这里有个容易混淆的地方，UE4拥有一个叫做UObject的类。这是一个比较底层的类别，也是AActor的基类。它拥有反射和序列化的一些属性，没有渲染和运动等组件。
<br> </br>
* <font size =4>Q: Game Object在声音引擎中什么作用？</font>
* A: 对于游戏中每个发声体(Emitter),都需要注册给Wwise。最终每个声音事件的播放参数，在声音引擎中结算时都需要Emitter的各种数据,这里的Emitter就是Game Object。还有一类用来收听声源的收听体(Listener), 他们收集Emitter播放的声音以进行3D结算时需要的数据也得从注册的Game Object上获取。

# Game Object在Wwise中的集成
* <font size =4>Q: AkGameObjectID是什么?</font>
* A: 游戏引擎传给声音引擎表示game object的唯一标识符，无符号64位整型。
```cpp
//AkTypes.h中有定义
typedef unsigned __int64	AkUInt64;
```

* <font size =4>Q: 怎么注册game object?</font>
 ```cpp 
  //ID为uint64_t
  const AKGameObjectID car = 1;
  const AKGameObjectID character = 2;
  (...)

  auto result_car = AK::SoundEngine::RegisterGameObj(car);
  if(result_car == AK_Success){...}
  
  //双参数版本后面一个参数可以是内部object名称 const char*，这个name作用主要是在Debug版本中方便profile
  auto result_character = AK::SoundEngine::RegisterGameObj(character, "hero");
  if(result_character == AK_Success){...}
   
  (...)
```

* <font size =4>Q: 怎么注销game object?</font>
```cpp
  AK::SoundEngine::UnregisterGameObj(car);
  AK::SOundEngine::UnregisterGameObj(character);
  //游戏结束注销所有对象
  AK::SoundEngine::UnregisterAllGameObj();
  ```

* <font size =4>Q：Unreal中怎么实现的？</font>
```cpp
#include <AkAudioDevice.h>
//注册
namespace FAkAudioDevice_Helpers
{
	void RegisterGameObject(AkGameObjectID in_gameObjId, const FString& Name)
	{
    //Release版本中不需要监视对象名称，所以改为ID注册对象方式
#ifdef AK_OPTIMIZED
		AK::SoundEngine::RegisterGameObj(in_gameObjId);
#else
		if (Name.Len() > 0)
		{
			AK::SoundEngine::RegisterGameObj(in_gameObjId, TCHAR_TO_ANSI(*Name));
		}
		else
		{
			AK::SoundEngine::RegisterGameObj(in_gameObjId);
		}
#endif
	}
}


//停用
void FAkAudioDevice::StopGameObject( UAkComponent * in_pComponent )
{
	AkGameObjectID gameObjId = DUMMY_GAMEOBJ;
	if ( in_pComponent )
	{
		gameObjId = in_pComponent->GetAkGameObjectID();
	}
	if ( m_bSoundEngineInitialized )
	{
		AK::SoundEngine::StopAll( gameObjId );
	}
}


//注销函数没有上层包装，直接调用了API接口，几个地方引用到
//AkAudioDevice卸载函数
void FAkAudioDevice::Teardown()
{
  ...
  
  //#define DUMMY_GAMEOBJ ((AkGameObjectID)0x2)
  AK::SoundEngine::UnregisterGameObj( DUMMY_GAMEOBJ );
  
  ...
}

//即播即销毁的声音对象
AkPlayingID FAkAudioDevice::PostEventAtLocation(...)
{
  ...

  AK::SoundEngine::UnregisterGameObj( objId );

  ...
}

//组件的注销
void FAkAudioDevice::UnregisterComponent(...)
{  
  //见后文
}
```

* <font size =4>Q: 组件(AkComponent)怎么作为game object注册</font>
```cpp
#include <AkAudioDevice.h>
//注册
void FAkAudioDevice::RegisterComponent( UAkComponent * in_pComponent )
{
	if (m_bSoundEngineInitialized && in_pComponent)
	{
		//检查是否使用AkComponent默认创建的Listener,并把AkComponent加入默认Emitters容器
    if (in_pComponent->UseDefaultListeners())
			m_defaultEmitters.Add(in_pComponent);

		//设置AkComponent名字
    FString WwiseGameObjectName = TEXT("");
		in_pComponent->GetAkGameObjectName(WwiseGameObjectName);
		
    //取AkComponent的ID，使用之前实现的接口注册AkComponent给引擎
		const AkGameObjectID gameObjId = in_pComponent->GetAkGameObjectID();
		FAkAudioDevice_Helpers::RegisterGameObject(gameObjId, WwiseGameObjectName);

		//如果使用空间组件的话，把AkComponent注册给SpatialAudioEmitter
    if(in_pComponent->bUseSpatialAudio)
			RegisterSpatialAudioEmitter(in_pComponent);
    
    //AkComponent注册给CallbackManager
		if (CallbackManager != nullptr)
			CallbackManager->RegisterGameObject(gameObjId);
	}
}

  //注销
void FAkAudioDevice::UnregisterComponent( UAkComponent * in_pComponent )
{
	if (m_bSoundEngineInitialized && in_pComponent)
	{
		//在SoundEngine中注销
    	const AkGameObjectID gameObjId = in_pComponent->GetAkGameObjectID();
		AK::SoundEngine::UnregisterGameObj(gameObjId);
		//在CallbackManager中注销
    	if (CallbackManager != nullptr)
		{
			CallbackManager->UnregisterGameObject(gameObjId);
		}
		//在SpatialAudioEmitter中注销
    	if(in_pComponent->bUseSpatialAudio)
			UnregisterSpatialAudioEmitter(in_pComponent);
	}
	//在listener中注销
        if (m_defaultListeners.Contains(in_pComponent))
	{
		RemoveDefaultListener(in_pComponent);
	}
	//在defaultEmitter中注销
        if (in_pComponent->UseDefaultListeners())
	{
		m_defaultEmitters.Remove(in_pComponent);
	}
	check(!m_defaultListeners.Contains(in_pComponent) && !m_defaultEmitters.Contains(in_pComponent));
	//重置SpatialAudioListener
         if (m_SpatialAudioListener == in_pComponent)
		m_SpatialAudioListener = nullptr;
}
```

* <font size =4>Q: 怎么通过组件(AkComponent)找到对应game object ID？</font>
```cpp
#include<AkComponent.h>
//调用这个类型转换
AkGameObjectID UAkComponent::GetAkGameObjectID() const
{
	return (AkGameObjectID)this;
}
```


# 依赖Game Object数据的一些接口
* <font size =4>Q: 哪些声音数据结算依赖于game object？</font>
1. <font size =4>Audio Object相关联的所有偏置量(offset)</font>
```cpp
AKRESULT FAkAudioDevice::SetGameObjectOutputBusVolume(...)
{
	 ...
	f (m_bSoundEngineInitialized)
	
	const AkGameObjectID emitterId = in_pEmitter ? i_pEmitter->GetAkGameObjectID() : DUMMY_GAMEOBJ;
	const AkGameObjectID listenerId = in_pListener ? i_pListener->GetAkGameObjectID() : DUMMY_GAMEOBJ;
	eResult = AK::SoundEngine::SetGameObjectOutputBusVolume(mitterId, listenerId, in_fControlValue);
	
	eturn eResult;
}
```

2. <font size =4>发声点位置和朝向</font>
```cpp
//和Event相关的接口
auto gameObjID = in_pComponent->GetAkGameObjectID();
AKRESULT AkAudioDevice::PostEvent(in_EventName, gameObjID, CeateCallbackPackage);

AKRESULT AK::SoundEngine::SeekOnEvent(TCHAR_TO_AK(*in_EventName),   i_pComponent->GetAkGameObjectID(), in_fPercent,   i_bSeekToNearestMarker, InPlayingID);

 //和position相关接口
AKRESULT FAkAudioDevice::SetPosition(...)
{
	...

	if(in_akComponent->bUseSpatialAudio)
			return AK::SpatialAudio::SetPosition(in_akComponent->GetAkGameObjectID(), in_SoundPosition);
	else
		return AK::SoundEngine::SetPosition(in_akComponent->GetAkGameObjectID(), in_SoundPosition);

	...
}

AKRESULT FAkAudioDevice::SetMultiplePositions(...)
{
	...

	return AK::SoundEngine::SetMultiplePositions(n_pGameObjectAkComponent->GetAkGameObjectID(), aositions.GetData(), aPosiGetSoundE(in_eMult));

	...
}

void FAkAudioDevice::SetListeners(...)
{
	...

	for (const auto& Listener : in_listenerSet)
		pListenerIds[index++] = Listener->GetAkGameObjectID();

	AK::SoundEngine::SetListeners(in_pEmitter->GetAkGameObjectID(), pListenerIds, NumListeners);

	...
}

void FAkAudioDevice::UpdateDefaultActiveListeners()
{
	...

	for (auto DefaultListenerIter = m_defaultListeners.CreateConstIterator(); DefaultListenerIter; ++DefaultListenerIter)
			pListenerIds[index++] = (*DefaultListenerIter)->GetAkGameObjectID();

	AK::SoundEngine::SetDefaultListeners(pListenerIds, NumDefaultListeners);

	...
}

//和component相关接口
void FAkAudioDevice::RegisterComponent(...)
{
	...
	
	const AkGameObjectID gameObjId = in_pComponent->GetAkGameObjectID();
		FAkAudioDevice_Helpers::RegisterGameObject(gameObjId, WwiseGameObjectName);

	...
}
```
3.<font size =4> Game Sync类数据(State, Switch,RTPC)</font>
```cpp
AKRESULT FAkAudioDevice::SetSwitch(...)
{
	...

	auto SwitchGroupID = AK::SoundEngine::GetIDFromString(TCHAR_TO_AK(in_pszSwitchGroup));
	auto SwitchStateID = AK::SoundEngine::GetIDFromString(TCHAR_TO_AK(in_pszSwitchState));
	eResult = AK::SoundEngine::SetSwitch(SwitchGroupID, SwitchStateID, GameObjID);

	...
}

AKRESULT FAkAudioDevice::SetState(...)
{
	...

	auto StateGroupID = AK::SoundEngine::GetIDFromString(TCHAR_TO_AK(in_pszStateGroup));
	auto StateID = AK::SoundEngine::GetIDFromString(TCHAR_TO_AK(in_pszState));
	eResult = AK::SoundEngine::SetState(StateGroupID, StateID);

	...
}

AKRESULT FAkAudioDevice::SetRTPCValue(...)
{
	...

	AkGameObjectID GameObjID = AK_INVALID_GAME_OBJECT;
	if ( in_pActor )
	{
		eResult = GetGameObjectID( in_pActor, GameObjID );
		if ( eResult != AK_Success )
			return eResult;
	}
	eResult = AK::SoundEngine::SetRTPCValue(TCHAR_TO_A(in_pszRtpcName), in_value, GameObjID,in_interpolationTimeMs );

	...
}
```
4. <font size =4>空间类DSP效果器所需数据</font>
```cpp
AKRESULT FAkAudioDevice::SetAttenuationScalingFactor(...)
{
	...

	eResult = AK::SoundEngine::SetScalingFactor(AkComponent->GetAkGameObjectID(), ScalingFactor);

	...
}

AKRESULT FAkAudioDevice::SetAuxSends(...)
{
	...

 AK::SpatialAudio::SetEmitterAuxSendValues(n_akComponent->GetAkGameObjectID(), in_AuxSendValues.GetData(), n_AuxSendValues.Num());

    ...
}

void FAkAudioDevice::RegisterSpatialAudioEmitter()
{
	...

	AK::SpatialAudio::RegisterEmitter(in_pComponent->GetAkGameObjectID(), settings);

	...
}
```
5.<font size =4> 声笼(Obstruction)和声障(Occlusion)计算所需数据</font>
```cpp
void UAkComponent::UpdateOcclusionObstruction()
{ ObstructionService.UpdateObstructionOcclusion(Listeners, GetPosition(), GetOwner(), GetSpatialAudioRoom(), OcclusionCollisionChannel, OcclusionRefreshInterval); 
}

FAkAudioDevice::PostEvent(...)
{
	...

	in_pComponent->UpdateOcclusionObstruction();

	...
}
```
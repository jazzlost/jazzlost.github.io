---
layout: post
title: "Wwise-UE中的回调设计"
subtitle: "Design of Callback Mechanism in Wwise-UE Integration"
author: "李AA"
published: true
header-img: "img/blog-seashore.jpg"
tags:
    - C++
    - Wwise
    - UE
    - Callback
---

- [前言](#前言)
- [Object](#object)
	- [AkComponentCallbackManager](#akcomponentcallbackmanager)
	- [AkCallbackInfoPool](#akcallbackinfopool)
	- [AkBankManager](#akbankmanager)
	- [创建](#创建)
- [Package](#package)
	- [Event](#event)
	- [1. IAkUserEventCallbackPackage](#1-iakusereventcallbackpackage)
	- [2. FAkFunctionPtrEventCallbackPackage](#2-fakfunctionptreventcallbackpackage)
	- [3. FAkBlueprintDelegateEventCallbackPackage](#3-fakblueprintdelegateeventcallbackpackage)
	- [4. FAkLatentActionEventCallbackPackage](#4-faklatentactioneventcallbackpackage)
	- [5. Hash](#5-hash)
	- [Bank](#bank)
	- [1. IAkBankCallbackInfo](#1-iakbankcallbackinfo)
	- [2. FAkBankFunctionPtrCallbackInfo](#2-fakbankfunctionptrcallbackinfo)
	- [3. FAkBankBlueprintDelegateCallbackInfo](#3-fakbankblueprintdelegatecallbackinfo)
		- [4. FAkBankLatentActionCallbackInfo](#4-fakbanklatentactioncallbackinfo)
- [Flow](#flow)
	- [1. Trigger Task](#1-trigger-task)
		- [Event](#event-1)
		- [Bank](#bank-1)
	- [2. Make Package](#2-make-package)
		- [Event](#event-2)
		- [bank](#bank-2)
		- [GameObjectToPackagesMap & UserCookieHashToPackageMap](#gameobjecttopackagesmap--usercookiehashtopackagemap)
	- [3. Send To SoundEngine](#3-send-to-soundengine)
		- [静态回调函数接口](#静态回调函数接口)
	- [4. Handle Package](#4-handle-package)
		- [AkCallbackInfoPool的作用](#akcallbackinfopool的作用)
	- [5. Clear Package](#5-clear-package)
	- [自定义CallbackPackage](#自定义callbackpackage)
		- [1. 声名代理](#1-声名代理)
		- [2. 创建Package子类](#2-创建package子类)
		- [3. 重载CreatePackage](#3-重载createpackage)
		- [4. 实现HandleAction与CancelCalback](#4-实现handleaction与cancelcalback)
		- [5. 适配PostEvent接口](#5-适配postevent接口)
- [总结](#总结)

# 前言
去年写过一篇对于[Wwise-UE回调流程的简介与测试](https://zhuanlan.zhihu.com/p/109102851)。本文想要继续讨论一些使用与实现上的细节, 同时对自定义扩展进行讨论。

# Object
![](WwiseCallback/Object.png)

## AkComponentCallbackManager
* 全局单例,负责Package的生成/清理，```Package```与```PlayingID```关系的维护

## AkCallbackInfoPool
* 负责```UAkCallbackInfo```实例的生成与维护。这个Pool的存在保证了每种类型```CallbackInfo```实例只有一个，可以反复利用

## AkBankManager
* 全局单例, 针对bank加载/卸载回调的管理，也维护一个已加载bank的list

## 创建
* 三个实例都在初始化时实例完成，值得注意的是```CallbackManager```初始化的失败会导致```AkAudio```的初始失败

```cpp
/** AkAudioDevice.cpp **/
bool FAkAudioDevice::EnsureInitialized()
{
    ......

    AkBankManager = new FAkBankManager;

	CallbackInfoPool = new AkCallbackInfoPool;

    CallbackManager = new FAkComponentCallbackManager();
	
    return CallbackManager != nullptr;
}
```


# Package

## Event
* Event的回调被设计为Package的形式主要原因是需要```支持回调的动态控制```，可以runtime的注册与取消

## 1. IAkUserEventCallbackPackage
* Package基类，其中有两个最重要属性

```cpp
    /** 回调的Flag, 参考EAkCallbackType */
	uint32 uUserFlags;
    /** 这个是Package的哈希标识符，用来取消Callback与删除Package用的 */
	uint32 KeyHash;
```  

## 2. FAkFunctionPtrEventCallbackPackage
* Package子类, 增加了回调函数与Pakcage缓存, 因为回调接口类没有进行UE Wrap，所以建议作为AkAudio模块内的回调Package

```cpp
    /** 回调函数 */
	AkCallbackFunc pfnUserCallback;

	/** Package缓存 */
	void* pUserCookie;
```

## 3. FAkBlueprintDelegateEventCallbackPackage
* Package子类, 增加了动态多播代理，可以绑定```模块外和蓝图层```的回调函数

```cpp
    /** 多播代理 */
    FOnAkPostEventCallback BlueprintCallback

    /** 代理原型 */
    DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnAkPostEventCallback, EAkCallbackType, CallbackType, UAkCallbackInfo*, CallbackInfo);

```

## 4. FAkLatentActionEventCallbackPackage
* package子类，增加了```FWaitEndOfEventAction```代理, 用于蓝图中PostAndWaitEndOfEvent异步接口

```cpp
    /** 蓝图异步调用事件 */
	FWaitEndOfEventAction* EndOfEventLatentAction;
```

## 5. Hash
* Package的哈希方式，确保唯一性就好了

```cpp
/** AkComponentCallbackManager.cpp **/

    uint32 FAkComponentCallbackManager::GetKeyHash(void* Key)
    {
    	return GetTypeHash(Key);
    }
    
    uint32 FAkComponentCallbackManager::GetKeyHash(const    FOnAkPostEventCallback& Key)
    {
    	return HashCombine(GetTypeHash(Key.GetUObject()), GetTypeHash(Key.GetFunctionName()));
    }
```
## Bank
* bank的回调不需要动态控制的功能，所以保持为简单的```CallbackInfo```

## 1. IAkBankCallbackInfo
* CallbackInfo基类, 里面有关联bank的指针

```cpp
    /** 此回调关联Bank */
    class UAkAudioBank* Bank;
```

## 2. FAkBankFunctionPtrCallbackInfo
* CallbackInfo子类, 增加了```回调函数```与```cookie```缓存, 因为回调接口类没有进行UE Wrap，所以建议作为AkAudio模块内的回调callbackinfo

```cpp
    /** 回调函数 */
    AkBankCallbackFunc CallbackFunc;
    /** 用户自定义cookie */
	void* UserCookie;
```

## 3. FAkBankBlueprintDelegateCallbackInfo
* Callbackinfo子类, 增加了动态多播代理，可以绑定```模块外和蓝图层```的回调函数

```cpp
    /** 多播代理 */
    FOnAkBankCallback BankBlueprintCallback;

    /** 代理原型 */
    DECLARE_DYNAMIC_DELEGATE_OneParam(FOnAkBankCallback, EAkResult, Result);
```

### 4. FAkBankLatentActionCallbackInfo
* callbackinfo子类，增加了```FWaitEndOfEventAction```代理, 用于蓝图中LoadBank异步接口

```cpp
    /** 蓝图异步调用事件 */
	FOnAkBankCallback BankBlueprintCallback;
```

# Flow

![](WwiseCallback/CallbackFlow.png)

## 1. Trigger Task

### Event

* 三种不同的PostEvent接口创建```不同的Package类型```

```cpp
/** AkAudioDevice.cpp **/

/** FAkFunctionPtrEventCallbackPackage类型 */
AkPlayingID FAkAudioDevice::PostEvent(
	const FString& in_EventName,
	UAkComponent* in_pComponent,
	AkUInt32 in_uFlags,
	AkCallbackFunc in_pfnCallback,
	void * in_pCookie,
	const TArray<AkExternalSourceInfo>& in_ExternalSources)

/** FAkBlueprintDelegateEventCallbackPackage类型 */
AkPlayingID FAkAudioDevice::PostEvent(
	const FString& in_EventName,
	UAkComponent* in_pComponent,
	const FOnAkPostEventCallback& PostEventCallback,
	AkUInt32 in_uFlags,
	const TArray<AkExternalSourceInfo>& in_ExternalSources)

/** FAkLatentActionEventCallbackPackage类型 */
AkPlayingID FAkAudioDevice::PostEventLatentAction(
	const FString& in_EventName,
	UAkComponent* in_pComponent,
	FWaitEndOfEventAction* LatentAction,
	const TArray<AkExternalSourceInfo>& in_ExternalSources)
```

* 这里面要注意下, 上层PostEvent接口最后都生成了一个只有AkGameObjectID的```匿名函数对象```, 然后传递给最下层的直接和SoundEngine对话的那个PostEvent,集成中为数不多比较骚的地方

```cpp
	/** FAkFunctionPtrEventCallbackPackage类型 */
	return PostEvent(in_EventName, in_pComponent, in_ExternalSources, [in_pfnCallback, in_pCookie, in_uFlags, this](AkGameObjectID gameObjID) {
		return CallbackManager->CreateCallbackPackage(in_pfnCallback, in_pCookie, in_uFlags, gameObjID);
	});

	/** FAkBlueprintDelegateEventCallbackPackage类型 */
	return PostEvent(in_EventName, in_pComponent, in_ExternalSources, [PostEventCallback, in_uFlags, this](AkGameObjectID gameObjID) {
		return CallbackManager->CreateCallbackPackage(PostEventCallback, in_uFlags, gameObjID);
	});

	/** FAkLatentActionEventCallbackPackage类型 */
		return PostEvent(in_EventName, in_pComponent, in_ExternalSources, [LatentAction, this](AkGameObjectID gameObjID) {
		return CallbackManager->CreateCallbackPackage(LatentAction, gameObjID);
	});
```

### Bank
* 三种不同的LoadBank接口创建```不同的CallbackInfo类型```

```cpp

/** FAkBankFunctionPtrCallbackInfo类型 */
AKRESULT FAkAudioDevice::LoadBank(
	class UAkAudioBank *     in_Bank,
	AkBankCallbackFunc  in_pfnBankCallback,
	void *              in_pCookie,
	AkMemPoolId         in_memPoolId,
	AkBankID &          out_bankID
)

/** FAkBankBlueprintDelegateCallbackInfo类型 */
AKRESULT FAkAudioDevice::LoadBankAsync(
	class UAkAudioBank *     in_Bank,
	const FOnAkBankCallback& BankLoadedCallback,
	AkMemPoolId         in_memPoolId,
	AkBankID &          out_bankID
)

/** FAkBankLatentActionCallbackInfo类型 */
AKRESULT FAkAudioDevice::LoadBank(
	class UAkAudioBank *     in_Bank,
	FWaitEndBankAction* LoadBankLatentAction
)
```
* ```UnloadBank```和```LoadBank```没有区别，三个接口对应三种CallbackInfo


## 2. Make Package

### Event
* CallbackManager中为不同Package重载了```CreateCallbackPackage```接口

```cpp
/** AkComponentCallbackManager.h **/

	/** FAkFunctionPtrEventCallbackPackage类型 */
	IAkUserEventCallbackPackage* CreateCallbackPackage(AkCallbackFunc in_cbFunc, void* in_Cookie, uint32 in_Flags, AkGameObjectID in_gameObjID);

	/** FAkBlueprintDelegateEventCallbackPackage类型 */
	IAkUserEventCallbackPackage* CreateCallbackPackage(FOnAkPostEventCallback BlueprintCallback, uint32 in_Flags, AkGameObjectID in_gameObjID);

	/** FAkLatentActionEventCallbackPackage类型 */
	IAkUserEventCallbackPackage* CreateCallbackPackage(FWaitEndOfEventAction* LatentAction, AkGameObjectID in_gameObjID);

```

* 上述的PostEvent接口内都调用了```CallbackManager::CreateCallbackPackage```, 基本就是简单粗暴的new了一个package出来，然后放到两个map中后续进行管理，这两个map下面会讨论

```cpp
/** FAkFunctionPtrEventCallbackPackage类型 */
IAkUserEventCallbackPackage* FAkComponentCallbackManager::CreateCallbackPackage(AkCallbackFunc in_cbFunc, void* in_Cookie, uint32 in_Flags, AkGameObjectID in_gameObjID)
{
	/** 哈希Cookie用来创建Package标识 */
	uint32 KeyHash = GetKeyHash(in_Cookie);
	auto pPackage = new FAkFunctionPtrEventCallbackPackage(in_cbFunc, in_Cookie, in_Flags, KeyHash);
	if (pPackage)
	{
		FScopeLock Lock(&CriticalSection);
		/** 添加到GameObject-Packages map */
		GameObjectToPackagesMap.FindOrAdd(in_gameObjID).Add(pPackage);
		/** 添加到hash-package map */
		UserCookieHashToPackageMap.Add(KeyHash, pPackage);
	}

	return pPackage;
}

/** FAkBlueprintDelegateEventCallbackPackage类型 */
IAkUserEventCallbackPackage* FAkComponentCallbackManager::CreateCallbackPackage(FOnAkPostEventCallback BlueprintCallback, uint32 in_Flags, AkGameObjectID in_gameObjID)
{
	/** 哈希代理的地址来创建Package标识 */
	uint32 KeyHash = GetKeyHash(BlueprintCallback);
	auto pPackage = new FAkBlueprintDelegateEventCallbackPackage(BlueprintCallback, in_Flags, KeyHash);
	if (pPackage)
	{
		FScopeLock Lock(&CriticalSection);
		/** 添加到GameObject-Packages map */
		GameObjectToPackagesMap.FindOrAdd(in_gameObjID).Add(pPackage);
		/** 添加到hash-package map */
		UserCookieHashToPackageMap.Add(KeyHash, pPackage);
	}

	return pPackage;
}

/** FAkLatentActionEventCallbackPackage类型 */
IAkUserEventCallbackPackage* FAkComponentCallbackManager::CreateCallbackPackage(FWaitEndOfEventAction* LatentAction, AkGameObjectID in_gameObjID)
{
	/** LatentAction类型的Package不支持动态取消回调，所以不需要哈希 */
	auto pPackage = new FAkLatentActionEventCallbackPackage(LatentAction, 0);
	if (pPackage)
	{
		FScopeLock Lock(&CriticalSection);
		/** 添加到GameObject-Packages map */
		GameObjectToPackagesMap.FindOrAdd(in_gameObjID).Add(pPackage);
	}

	return pPackage;
}

```


### bank

* bank因为没用用Package的形式, 只是简单的CallbackInfo所以BankManager中没有实现Create接口, 而是在触发接口中简单粗暴的new了对应的类型

```cpp
/** AkAudioDevice.cpp **/


/** FAkBankFunctionPtrCallbackInfo类型 */
AKRESULT FAkAudioDevice::LoadBank(
	class UAkAudioBank *     in_Bank,
	AkBankCallbackFunc  in_pfnBankCallback,
	void *              in_pCookie,
	AkMemPoolId         in_memPoolId,
	AkBankID &          out_bankID
)
{
	if (EnsureInitialized() && in_Bank)
	{
		if (AkBankManager != NULL)
		{
			/** 直接new */
			IAkBankCallbackInfo* cbInfo = new FAkBankFunctionPtrCallbackInfo(in_pfnBankCallback, in_Bank, in_pCookie);
			if (cbInfo)
			{
				/** 直接传给SoundEngine */
				return AK::SoundEngine::LoadBank(TCHAR_TO_AK(*(in_Bank->GetName())), FAkBankManager::BankLoadCallback, cbInfo, in_memPoolId, out_bankID);
			}
		}
		else
		{
			return AK::SoundEngine::LoadBank(TCHAR_TO_AK(*(in_Bank->GetName())), in_pfnBankCallback, in_pCookie, in_memPoolId, out_bankID);
		}
	}
	return AK_Fail;
}

/** FAkBankBlueprintDelegateCallbackInfo类型 */
AKRESULT FAkAudioDevice::LoadBankAsync(
	class UAkAudioBank *     in_Bank,
	const FOnAkBankCallback& BankLoadedCallback,
	AkMemPoolId         in_memPoolId,
	AkBankID &          out_bankID
)
{
	if (EnsureInitialized() && AkBankManager != NULL && in_Bank) // ensure audiolib is initialized
	{
		/** 直接new */
		IAkBankCallbackInfo* cbInfo = new FAkBankBlueprintDelegateCallbackInfo(in_Bank, BankLoadedCallback);

		// Need to hijack the callback, so we can add the bank to the loaded banks list when successful.
		if (cbInfo)
		{
			/** 直接传给SoundEngine */
			return AK::SoundEngine::LoadBank(TCHAR_TO_AK(*(in_Bank->GetName())), FAkBankManager::BankLoadCallback, cbInfo, in_memPoolId, out_bankID);
		}
	}
	return AK_Fail;
}

/** FAkBankLatentActionCallbackInfo类型 */
AKRESULT FAkAudioDevice::LoadBank(
	class UAkAudioBank *     in_Bank,
	FWaitEndBankAction* LoadBankLatentAction
)
{
	if (EnsureInitialized() && AkBankManager != NULL && in_Bank) // ensure audiolib is initialized
	{
		/** 直接new */
		IAkBankCallbackInfo* cbInfo = new FAkBankLatentActionCallbackInfo(in_Bank, LoadBankLatentAction);

		// Need to hijack the callback, so we can add the bank to the loaded banks list when successful.
		if (cbInfo)
		{
			AkBankID BankId;
			/** 直接传给SoundEngine */
			return AK::SoundEngine::LoadBank(TCHAR_TO_AK(*(in_Bank->GetName())), FAkBankManager::BankLoadCallback, cbInfo, AK_DEFAULT_POOL_ID, BankId);
		}
	}
	return AK_Fail;
}
```

### GameObjectToPackagesMap & UserCookieHashToPackageMap

* ```GameObjectToPackagesMap```中储存了所有在SoundEngine注册过的GameObject与它们此时还没有处理完的Package的映射关系

```cpp
/** AkComponentCallbackManager.h **/

	/** Package自定义Set */
	typedef TSet<IAkUserEventCallbackPackage*> PackageSet;

	/** 所有注册给SoundEngine的GameObject都会在这里保存一个ID,之后维护与其PackageSet关系 */
	TMap<AkGameObjectID, PackageSet, FDefaultSetAllocator, PackageSetGameObjectIDKeyFuncs> GameObjectToPackagesMap;
```

* GameObjectToPackagesMap中的数据用处主要是判断Post的Event是否还在Active状态，说白了就是有没有播完。其实维护这个Map的代价挺高的, 如果只是为了判断事件状态，我觉得应该从SoundEngine内去实现这个接口

```cpp
/** AkComponentCallbackManager.cpp **/
bool FAkComponentCallbackManager::HasActiveEvents(AkGameObjectID in_gameObjID)
{
	FScopeLock Lock(&CriticalSection);
	/** 通过判断GameObject此时是否有未处理的Package,来判断事件是否还是Active状态 */
	auto pPackageSet = GameObjectToPackagesMap.Find(in_gameObjID);
	return pPackageSet && pPackageSet->Num() > 0;
}

/** AkComponet.cpp **/

bool UAkComponent::HasActiveEvents() const
{
	auto CallbackManager = FAkComponentCallbackManager::GetInstance();
	return (CallbackManager != nullptr) && CallbackManager->HasActiveEvents(GetAkGameObjectID());
}

/** Tick级别的Map查询, 用来实现AkComponent的AutoDestroy功能 */
void UAkComponent::TickComponent(float DeltaTime, enum ELevelTick TickType, FActorComponentTickFunction *ThisTickFunction)
{
	......
	if (!HasActiveEvents() && bAutoDestroy && bStarted)
		DestroyComponent();
}
```

* ```UserCookieHashToPackageMap```中储存了cookie的哈希值与cookie所在package的映射关系

```cpp
/** AkComponentCallbackManager.h **/

	/** cookie哈希值与包含其的Package的map */
	TMultiMap<uint32, IAkUserEventCallbackPackage*> UserCookieHashToPackageMap;
```

* UserCookieHashToPackageMap中的数据主要作用是可以动态的取消回调，可以理解为```CreatePackage以后但是还没有HandleAction期间```,都可以把Package清理掉

```cpp
/** AkComponentCallbackManager.cpp **/

/** 取消回调接口 */
void FAkComponentCallbackManager::CancelEventCallback(const FOnAkPostEventCallback& in_Delegate)
{
	CancelKeyHash(GetKeyHash(in_Delegate));
}

/** 通过cookie哈希值找到关联Packages，执行CancelCallback */
void FAkComponentCallbackManager::CancelKeyHash(uint32 HashToCancel)
{
	FScopeLock AutoLock(&CriticalSection);

	TArray<IAkUserEventCallbackPackage*> PackagesToCancel;
	UserCookieHashToPackageMap.MultiFind(HashToCancel, PackagesToCancel);

	for (auto iter = PackagesToCancel.CreateConstIterator(); iter; ++iter)
	{
		if (*iter)
		{
			(*iter)->CancelCallback();
		}
	}
}
```

## 3. Send To SoundEngine

### 静态回调函数接口
* Event与Bank的CallbakcManager中都有一个```静态的回调接口```，这个接口也是传给SoundEngine进行回调的公共接口, SoundEngine回调后集成相关的所有回调处理都从这里开始

```cpp
/** AkComponentCallbackManager.h **/

	static void AkComponentCallback(AkCallbackType in_eType, AkCallbackInfo* in_pCallbackInfo);

/** AkBankManager.h */

	static void BankLoadCallback(
		AkUInt32		in_bankID,
		const void *	in_pInMemoryBankPtr,
		AKRESULT		in_eLoadResult,
		AkMemPoolId		in_memPoolId,
		void *			in_pCookie
	);
```

* Package最终在这个模板函数中生成，作为```cookie```发送给SoundEngine

```cpp
template<typename FCreateCallbackPackage>
AkPlayingID FAkAudioDevice::PostEvent(
	const FString& in_EventName,
	const AkGameObjectID in_gameObjectID,
	const TArray<AkExternalSourceInfo>& in_ExternalSources,
	FCreateCallbackPackage CreateCallbackPackage
)
{
	AkPlayingID playingID = AK_INVALID_PLAYING_ID;

	if (m_bSoundEngineInitialized && CallbackManager)
	{
		/** 最终的CreateCallbackPackage, 只有需要一个参数 */
		auto pPackage = CreateCallbackPackage(in_gameObjectID);
		if (pPackage)
		{
			playingID = AK::SoundEngine::PostEvent(
				  TCHAR_TO_AK(*in_EventName)
				, in_gameObjectID
				, pPackage->uUserFlags | AK_EndOfEvent
				/** 静态回调函数接口 */
				, &FAkComponentCallbackManager::AkComponentCallback
				/** 可以看到Package作为cookie参数传给了SoundEngine */
				, pPackage
				, in_ExternalSources.Num()
				, const_cast<AkExternalSourceInfo*>(in_ExternalSources.GetData())
			);
			if (playingID == AK_INVALID_PLAYING_ID)
			{
				CallbackManager->RemoveCallbackPackage(pPackage, in_gameObjectID);
			}
		}
	}

	return playingID;
}
```

* bank的回调则是在LoadBank接口内直接传给SondEngine,可以看其中一个示例

```cpp
AKRESULT FAkAudioDevice::LoadBank(
	class UAkAudioBank *     in_Bank,
	AkBankCallbackFunc  in_pfnBankCallback,
	void *              in_pCookie,
	AkMemPoolId         in_memPoolId,
	AkBankID &          out_bankID
)
{
	if (EnsureInitialized() && in_Bank) // ensure audiolib is initialized
	{
		if (AkBankManager != NULL)
		{
			/** 直接new一个CallbackInfo */
			IAkBankCallbackInfo* cbInfo = new FAkBankFunctionPtrCallbackInfo(in_pfnBankCallback, in_Bank, in_pCookie);

			if (cbInfo)
			{
				/** CallbackInfo直接传入SioundEngine */
				return AK::SoundEngine::LoadBank(TCHAR_TO_AK(*(in_Bank->GetName())), 
												/** 静态回调函数接口 */
												FAkBankManager::BankLoadCallback, 
												/** CallbackInfo作为cookie传入 */
												cbInfo, 
												in_memPoolId, 
												out_bankID);
			}
		}
		else
		{
			return AK::SoundEngine::LoadBank(TCHAR_TO_AK(*(in_Bank->GetName())), in_pfnBankCallback, in_pCookie, in_memPoolId, out_bankID);
		}
	}
	return AK_Fail;
}
```

## 4. Handle Package

* SoundEngine回调的第一站就是```静态回调函数接口```

```cpp
/** AkComponentCallbackManager.cpp **/

void FAkComponentCallbackManager::AkComponentCallback(AkCallbackType in_eType, AkCallbackInfo* in_pCallbackInfo)
{
	/** Cookie转为Package基类 */
	auto pPackage = (IAkUserEventCallbackPackage*)in_pCallbackInfo->pCookie;

	if (Instance && pPackage)
	{	
		/** 获取package中GameObjectID */
		const auto& gameObjID = in_pCallbackInfo->gameObjID;
		bool deletePackage = false;

		{
			FScopeLock Lock(&Instance->CriticalSection);
			/** 找到GameObjectID关联的PackageSet */
			auto pPackageSet = Instance->GameObjectToPackagesMap.Find(gameObjID);
			/** 如果是事件结束回调就从PackageSet里面清理掉这个Package */
			if (pPackageSet && in_eType == AK_EndOfEvent)
			{
				Instance->RemovePackageFromSet(pPackageSet, pPackage, gameObjID);
				/** 标记这个package可以清理 */
				deletePackage = true;
			}
		}

		
		if ((pPackage->uUserFlags & in_eType) != 0)
		{	
			/** 执行Package的HandleAction来处理Package */
			pPackage->HandleAction(in_eType, in_pCallbackInfo);
		}

		if (deletePackage)
		{	
			/** 很重要！这里不清理就内存泄露了, 佩服用裸指针的人 */
			delete pPackage;
		}
	}
}
```

* BankManager的静态回调函数接口

```cpp
/** AkBankManager.cpp **/

void FAkBankManager::BankLoadCallback(
	AkUInt32		in_bankID,
	const void *	in_pInMemoryBankPtr,
	AKRESULT		in_eLoadResult,
	AkMemPoolId		in_memPoolId,
	void *			in_pCookie
)
{
	if (in_pCookie)
	{
		/** 把cookie转为IAkBankCallbackInfo类 */
		IAkBankCallbackInfo* BankCbInfo = (IAkBankCallbackInfo*)in_pCookie;
		if (in_eLoadResult == AK_Success)
		{
			FScopeLock Lock(&GetInstance()->m_BankManagerCriticalSection);
			/** 这里是维护了一个成功加载的Bank List, 引用计数用的 */
			GetInstance()->AddLoadedBank(BankCbInfo->Bank);
		}

		/** 调用不同类型CallbackInfo的HandleAction接口 */
		BankCbInfo->HandleAction(in_bankID, in_pInMemoryBankPtr, in_eLoadResult, in_memPoolId);

		/** 重要！清理CallbackInfo */
		delete BankCbInfo;
	}
}
```

* 每种Package类型都需要实现自己的```HandleAction```接口，来处理自定义的回调流程

```cpp
/** AkComponentCallbackManager.cpp **/

/** FAkFunctionPtrEventCallbackPackage类型 */
void FAkFunctionPtrEventCallbackPackage::HandleAction(AkCallbackType in_eType, AkCallbackInfo* in_pCallbackInfo)
{
	if (pfnUserCallback)
	{
		/** 把Package中的cookie填充进这个Callbackinfo中 */
		in_pCallbackInfo->pCookie = pUserCookie;
		/** 调用Package中的回调函数 */
		pfnUserCallback(in_eType, in_pCallbackInfo);
		/** 把CallbackInfo的cookie指向这个package本身，可能和SoundEngine内对CallbackInfo的回收有关 */
		in_pCallbackInfo->pCookie = (void*)this;
	}
}

/** FAkBlueprintDelegateEventCallbackPackage类型 */
void FAkBlueprintDelegateEventCallbackPackage::HandleAction(AkCallbackType in_eType, AkCallbackInfo* in_pCallbackInfo)
{
	if (BlueprintCallback.IsBound())
	{
		/** 直接按回调信息类型，申请新内存把AkCallbackInfo拷过来 */
		AkCallbackInfo* cbInfoCopy = AkCallbackTypeHelpers::CopyWwiseCallbackInfo(in_eType, in_pCallbackInfo);
		/** 把AkCallbackType类型转换为EAkCallbackType */
		EAkCallbackType BlueprintCallbackType = AkCallbackTypeHelpers::GetBlueprintCallbackTypeFromAkCallbackType(in_eType);
		auto CachedBlueprintCallback = BlueprintCallback;
		/** 游戏线程上开异步，把CallbackInfo，CallbackType和回调函数传过去 */
		AsyncTask(ENamedThreads::GameThread, [cbInfoCopy, BlueprintCallbackType, CachedBlueprintCallback]
		{
			UAkCallbackInfo* BlueprintAkCallbackInfo = nullptr;
			if (cbInfoCopy)
			{
				/** 根据EAkCallbackType把AkCallbackInfo转为UAkCakkbackInfo, 这里涉及到AkCallbackInfoPool下面会讨论 */
				BlueprintAkCallbackInfo = AkCallbackTypeHelpers::GetBlueprintableCallbackInfo(BlueprintCallbackType, cbInfoCopy);
				/** 很重要!始放之前拷贝AkCallbackinfo时分配的内存 */
				FMemory::Free(cbInfoCopy);
			}

			/** 广播了!!! */
			CachedBlueprintCallback.ExecuteIfBound(BlueprintCallbackType, BlueprintAkCallbackInfo);

			if (auto AudioDevice = FAkAudioDevice::Get())
			{
				if (auto CallbackInfoPool = AudioDevice->GetAkCallbackInfoPool())
				{
					/** AkCallbackInfoPool中这个EAkCallbackType类型的UAkCallbackInfo用完了, 要重置后返回pool中，重复利用*/
					CallbackInfoPool->Release(BlueprintAkCallbackInfo);
				}
			}
		});
	}
}

/** FAkLatentActionEventCallbackPackage类型 */
void FAkLatentActionEventCallbackPackage::HandleAction(AkCallbackType in_eType, AkCallbackInfo* in_pCallbackInfo)
{
	if (EndOfEventLatentAction)
	{
		/** LatentAction由父类统一执行，只需要标记就行 */
		EndOfEventLatentAction->EventFinished = true;
	}
}
```

* 每种Bank的CallbackInfo中也要实现```HandleAction```接口

```cpp
/** AkBankManager.cpp **/

/** FAkBankFunctionPtrCallbackInfo类型 */
void FAkBankFunctionPtrCallbackInfo::HandleAction(AkUInt32 BankID, const void * InMemoryBankPtr, AKRESULT ActionResult, AkMemPoolId MemPoolId)
{
	if (CallbackFunc != nullptr)
	{	
		/** 直接调用传入的回调函数 */
		CallbackFunc(BankID, InMemoryBankPtr, ActionResult, MemPoolId, UserCookie);
	}
}

/** FAkBankLatentActionCallbackInfo类型 */
void FAkBankLatentActionCallbackInfo::HandleAction(AkUInt32 BankID, const void * InMemoryBankPtr, AKRESULT ActionResult, AkMemPoolId MemPoolId)
{
	if (BankLatentAction != nullptr)
	{
		/** LatentAction由父类统一执行，只需要标记就行 */
		BankLatentAction->ActionDone = true;
	}
}

/** FAkBankBlueprintDelegateCallbackInfo类型 */
void FAkBankBlueprintDelegateCallbackInfo::HandleAction(AkUInt32 BankID, const void * InMemoryBankPtr, AKRESULT ActionResult, AkMemPoolId MemPoolId)
{
	if (BankBlueprintCallback.IsBound())
	{
		auto CachedBlueprintCallback = BankBlueprintCallback;
		/** 游戏线程直接异步执行广播 */
		AsyncTask(ENamedThreads::GameThread, [ActionResult, CachedBlueprintCallback]()
		{
			CachedBlueprintCallback.ExecuteIfBound((EAkResult)ActionResult);
		});
	}
}
```

### AkCallbackInfoPool的作用
* ```AkCallbackInfoPool```作为一个对象池, 主要是维护了一个```EAkCallbackType```与```UAkCallbackInfo```的对象池，目的是保证每个EAkCallbackType类型的UAkCallbackInfo对象只有一个，每次广播用完后都重置可以重复利用

```cpp
/** AkCallbackInfoPool.h**/

class AkCallbackInfoPool final
{
public:
	/** 每次由AkCallbackInfo需要转为UAkCakkbackInfo时，就按EAkCallbackType来池子中取对象，没用的话就创建个新的 */
	template<typename CallbackType>
	CallbackType* Acquire()
	{
		return static_cast<CallbackType*>(internalAcquire(CallbackType::StaticClass()));
	}

	/** 广播后需要清理这个UAkCallbackInfo等下次取用 */
	void Release(UAkCallbackInfo* instance);

private:
	UAkCallbackInfo* internalAcquire(UClass* type);

private:
	/** 对象池，每个UAkCallbackType对应一个UAkCallbackInfo对象 */
	TMap<UClass*, TArray<UAkCallbackInfo*>> Pool;
	/** 这个是防止UE的GC把所有对象都强引用起来 */
	TArray<TStrongObjectPtr<UAkCallbackInfo>> gcStorage;
};

```

## 5. Clear Package

* Package是New出来的，没有引用计数，所以合理清理掉是很重要的

```cpp
/** AkComponentCallbackManager.cpp **/

/** 如果是EndOfEvent的回调，直接在静态回调接口里面就清理了 */
void FAkComponentCallbackManager::AkComponentCallback(AkCallbackType in_eType, AkCallbackInfo* in_pCallbackInfo)
{
	......
	
	auto pPackageSet = Instance->GameObjectToPackagesMap.Find(gameObjID);
	if (pPackageSet && in_eType == AK_EndOfEvent)
	{
		/**GameObjectToPackagesMap中找出PackageSet,PackageSet中删除这个Package*/
		Instance->RemovePackageFromSet(pPackageSet, pPackage, gameObjID);
		/** delete标记 */
		deletePackage = true;
	}

	......

	if (deletePackage)
	{
		/** 清理！ */
		delete pPackage;
	}
}

/** GameObject注销的时候也要检查清理一遍 */
void FAkComponentCallbackManager::UnregisterGameObject(AkGameObjectID in_gameObjID)
{
	AK::SoundEngine::CancelEventCallbackGameObject(in_gameObjID);

	/** 直接用GameObjectID找到关联PackageSet,整个清理掉 */
	FScopeLock Lock(&CriticalSection);
	auto pPackageSet = GameObjectToPackagesMap.Find(in_gameObjID);
	if (pPackageSet)
	{
		for (auto pPackage : *pPackageSet)
		{
			UserCookieHashToPackageMap.Remove(pPackage->KeyHash, pPackage);
			/** 清理！ */
			delete pPackage;
		}

		GameObjectToPackagesMap.Remove(in_gameObjID);
	}
}

/** 最后的保底，CallbackManager析构的时候把所有package都清理掉 */
FAkComponentCallbackManager::~FAkComponentCallbackManager()
{
	for (auto& Item : GameObjectToPackagesMap)
	{
		for (auto pPackage : Item.Value)
		{	
			/** 清理！ */
			delete pPackage;
		}
	}

	Instance = nullptr;
}
```

## 自定义CallbackPackage

* 知道了Package的作用后，如果现有的Package类型不符合需求，我们就可以自定义Package了

![](WwiseCallback/CustomPackage.png)

### 1. 声名代理
* 按需求声明一个自定义多播代理,也可以用已经声明好的```FOnAkPostEventCallback```

```cpp
DECLARE_DYNAMIC_DELEGATE_FourParams(FCustomPostEventCallback, EAkCallbackType, CallbackType, UAkCallbackInfo*, CallbackInfo, FString, CustomStr, int, CustomIndex);
```

### 2. 创建Package子类
* 创建```IAkUserEventCallbackPackage```子类Pakcage

```cpp
class FCustomCallbackPackage : public IAkUserEventCallbackPackage
{
public:
	FCustomCallbackPackage(FCustomPostEventCallback PostEventCallback, uint32 Flags, uint32 in_Hash, FString in_CustomStr, int in_CustomIndex)
		: IAkUserEventCallbackPackage(Flags, in_Hash)
		, MyCallback(PostEventCallback)
		,CustomStr(in_CustomStr)
		,CustomIndex(CustomIndex)
	{}

	virtual void HandleAction(AkCallbackType in_eType, AkCallbackInfo* in_pCallbackInfo) override;
	virtual void CancelCallback() override;

private:
	FCustomPostEventCallback MyCallback;

	/** 这里可以添加各种自定义的Package成员了 */
	FString CustomStr;
	int CustonIndex;
	......
};
```

### 3. 重载CreatePackage
* ```AkCallbackManager```中重载```CreateCallbackPackage```接口

```cpp
/** AkComponentCallbackManager.cpp **/

IAkUserEventCallbackPackage* FAkComponentCallbackManager::CreateCallbackPackage(FCustomPostEventCallback MyCallback, uint32 in_Flags, AkGameObjectID in_gameObjID)
{
	/** 需要把代理哈希后用来生成Package */
	uint32 KeyHash = GetKeyHash(MyCallback);
	/** 创建自定义Pakcage, 传入自定义变量 */
	auto pPackage = new FCustomCallbackPackage(BlueprintCallback, in_Flags, KeyHash, "Hello", 888);
	if (pPackage)
	{
		FScopeLock Lock(&CriticalSection);
		/** 一定要加到两个Map中进行维护 */
		GameObjectToPackagesMap.FindOrAdd(in_gameObjID).Add(pPackage);
		UserCookieHashToPackageMap.Add(KeyHash, pPackage);
	}

	/** 返回Package */
	return pPackage;
}
```

### 4. 实现HandleAction与CancelCalback
* 代理类型的回调需要在```HandleAction```中进行GamePlay线程的```异步处理```

```cpp
void FCustomCallbackPackage::HandleAction(AkCallbackType in_eType, AkCallbackInfo* in_pCallbackInfo)
{
	if (CustomCallback.IsBound())
	{
		/** 因为in_pCallbackInfo之后要被回收，先拷贝出来给异步处理用 */
		AkCallbackInfo* cbInfoCopy = AkCallbackTypeHelpers::CopyWwiseCallbackInfo(in_eType, in_pCallbackInfo);
		/** AkCallbackType转EAkCallbackType */
		EAkCallbackType CustomCallbackType = AkCallbackTypeHelpers::GetBlueprintCallbackTypeFromAkCallbackType(in_eType);
		/** 代理也拷贝出来给异步用 */
		auto CachedMyCallback = MyCallback;
		/** 自定义数据也拷贝出来 */
		FString Async_Str = CustomStr;
		int Async_Index = CusotomIndex;

		AsyncTask(ENamedThreads::GameThread, [cbInfoCopy, CustomCallbackType, CachedMyCallback, Async_Str, CustomIndex]
		{
			UAkCallbackInfo* CustomAkCallbackInfo = nullptr;
			if (cbInfoCopy)
			{
				/** AkCallbackInfo转UAkCallbackInfo */
				CustomAkCallbackInfo = AkCallbackTypeHelpers::GetBlueprintableCallbackInfo(CustomCallbackType, cbInfoCopy);
				/** 记得释放cookie内存 */
				FMemory::Free(cbInfoCopy);
			}
			/** 广播了！！！ */
			CachedMyCallback.ExecuteIfBound(CustomCallbackType, CustomAkCallbackInfo, Async_Str, Async_Index);

			if (auto AudioDevice = FAkAudioDevice::Get())
			{
				if (auto CallbackInfoPool = AudioDevice->GetAkCallbackInfoPool())
				{
					/** UAkCallbackInfo用完要记得释放，下次才能从对象池中重复使用 */
					CallbackInfoPool->Release(CustomAkCallbackInfo);
				}
			}
		});
	}
```

* 代理类型的```CancelCallback```把代理清理了就好了

```cpp
void FCustomCallbackPackage::CancelCallback()
{
	CustomCallback.Clear();
	uUserFlags = 0;
}
```

### 5. 适配PostEvent接口
* 需要新的PostEvent接口可以接纳自定义的回调代理与自定义数据

```cpp
AkPlayingID FAkAudioDevice::PostEvent(
	const FString& in_EventName,
	UAkComponent* in_pComponent,
	const FCustomPostEventCallback& MyCallback,
	FString in_CustomStr,
	int in_CustomIndex,
	AkUInt32 in_uFlags,
	const TArray<AkExternalSourceInfo>& in_ExternalSources,
)
{
	/** 函数对象直接由匿名函数表示， 匿名函数中创建我们的自定义Package */
	return PostEvent(in_EventName, in_pComponent, in_ExternalSources, [MyCallback, in_uFlags, in_CustomStr, in_CustomIndex, this](AkGameObjectID gameObjID) {
		return CallbackManager->CreateCallbackPackage(MyCallback, in_uFlags, gameObjID, in_CustomStr, in_CustomIndex);
	});
}
```

# 总结
* Wwise的回调设计扩展性还是很强的，虽然有很多裸指针让人很不放心。恰当的进行自定义Package的设计可以辅助开发一些意想不到的功能，不过也要根据实际情况控制好Package处理的时效性。不需要Package的地方也可以参考Bank的CallbackInfo就可以得到不错的效果。

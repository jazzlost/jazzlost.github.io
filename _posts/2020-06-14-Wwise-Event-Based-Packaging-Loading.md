---
layout: post
title: "Wwise Event-Based Packaging的加载与卸载"
subtitle: "Study of Wwise Event-Based Packaging System"
author: "李AA"
published: true
header-img: "img/blog-bg-climb.jpg"
tags:
    - Unreal
    - Wwise
    - Memory
---

* TOC
{:toc}

# 前言
* ### EBP的设计把资源的加载/卸载控制权完全交给了UE。对于音效师来说，工作流中可以忽略对于资源加载问题的考虑，把重心转移到Event的结构与逻辑设计上。对于程序来说，因为音效资源也从bnk被包装成了uasset，资源的加载/卸载管理也统一到了UE的资源管理流程中，维护音效资源和维护其他资源没有了任何差别，可以使用相同的维护逻辑。

# UE资源加载基础
[Actor生命周期](https://docs.unrealengine.com/en-US/Programming/UnrealArchitecture/Actors/ActorLifecycle/index.html)

[Level的加载](https://docs.unrealengine.com/en-US/Engine/LevelStreaming/Overview/index.html)

[AssetRegistry模块](https://docs.unrealengine.com/en-US/Programming/Assets/Registry/index.html)

[引用与加载关系](https://docs.unrealengine.com/en-US/Programming/Assets/ReferencingAssets/index.html)

[UE的异步加载](https://docs.unrealengine.com/en-US/Programming/Assets/AsyncLoading/index.html)


# EBP相关类的关系
* ### EBP中的类可以大概分为```UE资产类```/```数据类```/```行为类```

![](/img/in-post/EBP/ClassView.png)

# EBP资产加载
* ### 所有EBP相关资产的加载，现在都被拆分为了加载```Data```部分与加载```Media```部分，所以下面的加载流程都可以按这个思路来理解

* ### 重构后的集成把```行为```与```数据```做了更明显的区分，数据加载卸载操作都封装到了```AkIntegrationBehavior```

## UAkInitBank

1. ### InitBank的加载在初始化的时候完成，现在的InitBank是UAkAssetBase的一个子类

    ![](/img/in-post/EBP/AkInitBankLoad.png)

```cpp
/*这里通过AssetRegistry找到InitBank保存引用至AkAudioDevice*/
AKRESULT AkEventBasedIntegrationBehavior::AkAudioDevice_LoadInitBank(FAkAudioDevice* AkAudioDevice)
{
	if (AkAudioDevice->InitBank)
	{
		return AK_Success;
	}

	auto& assetRegistryModule = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry");

    /*直接通过AssetRegistry模块查找UAkInitBank类资产，默认找到的第一个是加载的InitBank*/
	TArray<FAssetData> initBankAssets;
	assetRegistryModule.Get().GetAssetsByClass(UAkInitBank::StaticClass()->GetFName(), initBankAssets);

	if (initBankAssets.Num() > 0)
	{
		AkAudioDevice->InitBank = Cast<UAkInitBank>(initBankAssets[0].GetAsset());
        // Prevent InitBank for being garbage collected
		AkAudioDevice->InitBank->AddToRoot(); 

		return AK_Success;
	}

	return AK_Fail;
}
```

2. ### 然后UAkInitBank的AssetData执行父类及自身的Load操作

    ![](/img/in-post/EBP/AkInitBankLoad02.png)

```cpp
void UAkAssetBase::Load()
{
	if (auto assetData = getAssetData())
	{   
        /*Data数据的Load操作*/
		assetData->Load();
	}
}

/*UAkAssetDataWithMedia的加载主要是加载关联的Media资源*/
AKRESULT UAkAssetDataWithMedia::Load()
{
	auto result = Super::Load();
	auto AudioDevice = FAkAudioDevice::Get();
	if (!AudioDevice)
		return result;

	if (result != AK_Success)
		return result;

	if (MediaList.Num() <= 0)
		return result;

    /*将关联Media文件添加到异步加载列表*/
	TArray<FSoftObjectPath> MediaToLoad;
	for (auto& media : MediaList)
		MediaToLoad.AddUnique(media.ToSoftObjectPath());

	mediaStreamHandle = AudioDevice->GetStreamableManager().RequestAsyncLoad(MediaToLoad);
	return result;
}

/*UAkAssetData的加载主要是将Data数据地址传给Wwise*/
AKRESULT AkEventBasedIntegrationBehavior::AkAssetData_Load(UAkAssetData* AkAssetData)
{
	auto AudioDevice = FAkAudioDevice::Get();
	if (!AudioDevice)
		return AK_Success;

	auto dataBulkSize = AkAssetData->Data.GetBulkDataSize();
	if (dataBulkSize <= 0)
		return AK_Success;

AKRESULT AkEventBasedIntegrationBehavior::AkAssetData_Load(UAkAssetData* AkAssetData)
{
	auto AudioDevice = FAkAudioDevice::Get();
	if (!AudioDevice)
		return AK_Success;

    /*获取数据块大小*/
	auto dataBulkSize = AkAssetData->Data.GetBulkDataSize();
	if (dataBulkSize <= 0)
		return AK_Success;

#if WITH_EDITOR
	AkAssetData->EditorRawData.Reset(dataBulkSize);
    /*编辑器模式下不直接挂钩FByteBulkData地址给Wwise，而是将拷贝挂钩给Wwise*/
	AkAssetData->RawData = FMemory::Memcpy(AkAssetData->EditorRawData.GetData(), AkAssetData->Data.LockReadOnly(), dataBulkSize);
	AkAssetData->Data.Unlock();
    /*挂钩数据给Wwise*/
	return AkEventBasedHelpers::LoadBankFromMemoryInternal(AudioDevice, dataBulkSize, AkAssetData->BankID, AkAssetData->RawData);
#else
	if (!AkAssetData->Data.IsBulkDataLoaded() || !AkAssetData->Data.IsAvailableForUse())
	{
		return AK_Success;
	}

	AkAssetData->RawData = AkAssetData->Data.LockReadOnly();
	auto result = AkEventBasedHelpers::LoadBankFromMemoryInternal(AudioDevice, dataBulkSize, AkAssetData->BankID, AkAssetData->RawData);
	AkAssetData->Data.Unlock();
	return result;
#endif
}
```

## UAkAudioEvent

![](/img/in-post/EBP/AkEventLoad02.png)

1. ### ```UAkAudioEvent```资产被引擎加载后，在PostLoad阶段调用```UAkAudioEvent```的Load操作，这里如果有本地化的资源会先Load这部分，然后进行```UAkAssetBase```的Load操作

```cpp
void AkEventBasedIntegrationBehavior::AkAudioEvent_Load(UAkAudioEvent* AkAudioEvent)
{
	if (AkAudioEvent->IsLocalized())
	{
		if (auto* audioDevice = FAkAudioDevice::Get())
		{
            /*本地化资源加载*/
			AkAudioEvent->loadLocalizedData(audioDevice->GetCurrentAudioCulture(), SwitchLanguageCompletedFunction{});
		}
	}
	else
	{
		AkAudioEvent->superLoad();
	}
}
```
2. ### UAkAudioType及子类的Load中会执行平台关联的资产验证与加载，这里开始进入Data的加载阶段

```cpp
/*UAkAudioType的加载主要是验证资产是否在Wwise中注册过*/
void UAkAudioType::PostLoad()
{
	Super::PostLoad();

	if (auto AudioDevice = FAkAudioDevice::Get())
	{
		auto idFromName = AudioDevice->GetIDFromString(GetName());
		if (ShortID == 0)
		{
			ShortID = idFromName;
		}
		else if (!IsA<UAkGroupValue>() && ShortID != 0 && ShortID != idFromName)
		{
			UE_LOG(LogAkAudio, Error, TEXT("%s - Current Short ID '%u' is different from ID from the name '%u'"), *GetName(), ShortID, idFromName);
		}
	}
}

/*UAkAssetBase的加载主要是找到平台关联的AssetData进行加载操作*/
void UAkAssetBase::Load()
{
	if (auto assetData = getAssetData())
	{
		assetData->Load();
	}
}

UAkAssetData* UAkAssetBase::getAssetData() const
{
	if (!PlatformAssetData)
		return nullptr;

#if WITH_EDITORONLY_DATA
	if (auto assetData = PlatformAssetData->AssetDataPerPlatform.Find(FPlatformProperties::IniPlatformName()))
		return *assetData;

	return nullptr;
#else
	return PlatformAssetData->CurrentAssetData;
#endif
}
```
3. ### Data加载阶段依次执行UAkAssetData及其子类的加载，这里主要是三个阶段 ```加载Data数据```/```加载Media数据```/```绑定Switch关联数据的加载卸载代理```

    ![](/img/in-post/EBP/AkAssetDataLoad.png)

```cpp
/*UAkAssetData的加载主要是将Data数据地址传给Wwise*/
AKRESULT AkEventBasedIntegrationBehavior::AkAssetData_Load(UAkAssetData* AkAssetData)
{
	auto AudioDevice = FAkAudioDevice::Get();
	if (!AudioDevice)
		return AK_Success;

    /*获取数据块大小*/
	auto dataBulkSize = AkAssetData->Data.GetBulkDataSize();
	if (dataBulkSize <= 0)
		return AK_Success;

#if WITH_EDITOR
	AkAssetData->EditorRawData.Reset(dataBulkSize);
    /*编辑器模式下不直接挂钩FByteBulkData地址给Wwise，而是将拷贝挂钩给Wwise*/
	AkAssetData->RawData = FMemory::Memcpy(AkAssetData->EditorRawData.GetData(), AkAssetData->Data.LockReadOnly(), dataBulkSize);
	AkAssetData->Data.Unlock();
    /*挂钩数据给Wwise*/
	return AkEventBasedHelpers::LoadBankFromMemoryInternal(AudioDevice, dataBulkSize, AkAssetData->BankID, AkAssetData->RawData);
#else
	if (!AkAssetData->Data.IsBulkDataLoaded() || !AkAssetData->Data.IsAvailableForUse())
	{
		return AK_Success;
	}

	AkAssetData->RawData = AkAssetData->Data.LockReadOnly();
	auto result = AkEventBasedHelpers::LoadBankFromMemoryInternal(AudioDevice, dataBulkSize, AkAssetData->BankID, AkAssetData->RawData);
	AkAssetData->Data.Unlock();
	return result;
#endif
}
```
```CPP
/*UAkAssetDataWithMedia的加载主要是加载关联的Media资源*/
AKRESULT UAkAssetDataWithMedia::Load()
{
	auto result = Super::Load();
	auto AudioDevice = FAkAudioDevice::Get();
	if (!AudioDevice)
		return result;

	if (result != AK_Success)
		return result;

	if (MediaList.Num() <= 0)
		return result;

	TArray<FSoftObjectPath> MediaToLoad;
    /*将关联Media文件添加到异步加载列表*/
	for (auto& media : MediaList)
		MediaToLoad.AddUnique(media.ToSoftObjectPath());

	mediaStreamHandle = AudioDevice->GetStreamableManager().RequestAsyncLoad(MediaToLoad);
	return result;
}
```

```cpp
/*UAkAssetDataSwitchContainer的加载主要是绑定Switch加载卸载代理*/
AKRESULT UAkAssetDataSwitchContainer::Load()
{
	auto result = Super::Load();

	if (result == AK_Success)
	{
        /*如果有关联Switch资产，执行Switch关联的Media的加载*/
		if (SwitchContainers.Num() > 0)
		{
			loadSwitchContainer(SwitchContainers);

			if (auto* audioDevice = FAkAudioDevice::Get())
			{
                /*绑定加载与卸载Switch的代理，由代理来维护Switch相关Media的加载与卸载*/
				audioDevice->OnLoadSwitchValue.AddUObject(this, &UAkAudioEventData::onLoadSwitchValue);
				audioDevice->OnUnloadSwitchValue.AddUObject(this, &UAkAudioEventData::onUnloadSwitchValue);
			}
		}
	}

	return result;
}

/*这里主要是加载了总Switch关联的Media,一起递归加载嵌套的Switch关联的Media*/
void UAkAssetDataSwitchContainer::loadSwitchContainer(UAkAssetDataSwitchContainerData* switchContainer)
{
	if (switchContainer && IsValid(switchContainer->GroupValue.Get()))
	{
		loadSwitchContainerMedia(switchContainer);

		loadSwitchContainer(switchContainer->Children);
	}
}

/*Switch关联Media的加载接口*/
void UAkAssetDataSwitchContainer::loadSwitchContainerMedia(UAkAssetDataSwitchContainerData * switchContainer)
{
	if (switchContainer->MediaList.Num() > 0)
	{
		if (auto* AudioDevice = FAkAudioDevice::Get())
		{
			TArray<FSoftObjectPath> MediaToLoad;
			for (auto& media : switchContainer->MediaList)
			{
				MediaToLoad.AddUnique(media.ToSoftObjectPath());
			}

			switchContainer->streamHandle = AudioDevice->GetStreamableManager().RequestAsyncLoad(MediaToLoad);
		}
	}
}
```

4. ### 本地化资源的加载

```cpp
/*本地化文件是最早进行加载的*/
void UAkAudioEvent::loadLocalizedData(const FString& audioCulture, const SwitchLanguageCompletedFunction& Function)
{
	if (auto* audioDevice = FAkAudioDevice::Get())
	{
        /*本地化资源涉及到Switch/State的加载*/
        /*UAkAudioEventData中才有本地化语言对应的Switch资源信息*/
		if (auto* eventData = Cast<UAkAudioEventData>(getAssetData()))
		{
			if (eventData->LocalizedMedia.Num() > 0)
			{
                /*找到本地化语言对应的Media资源后执行UAkAssetDataSwitchContainer的Load操作*/
				if (auto* localizedData = eventData->LocalizedMedia.Find(audioCulture))
				{
					(*localizedData)->Load();

					if (Function)
					{
						Function(true);
					}
					return;
				}
			}
		}

        /*没有找到本地化语言对应的Media资源则通过文件夹路径寻找资产*/
		TSoftObjectPtr<UAkAssetPlatformData>* eventDataSoftObjectPtr = LocalizedPlatformAssetDataMap.Find(audioCulture);
		if (eventDataSoftObjectPtr)
		{
			auto& assetRegistryModule = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry");

			FSoftObjectPath localizedDataPath = eventDataSoftObjectPtr->ToSoftObjectPath();

			if (!assetRegistryModule.Get().GetAssetByObjectPath(*localizedDataPath.ToString(), true).IsValid())
			{
                /*通过拼接路径来寻找本地化资源*/
				FString pathWithDefaultLanguage = eventDataSoftObjectPtr->ToSoftObjectPath().ToString().Replace(*audioCulture, *audioDevice->GetDefaultLanguage());
				auto assetData = assetRegistryModule.Get().GetAssetByObjectPath(FName(*pathWithDefaultLanguage), true);
				if (assetRegistryModule.Get().GetAssetByObjectPath(FName(*pathWithDefaultLanguage), true).IsValid())
				{
					localizedDataPath = FSoftObjectPath(pathWithDefaultLanguage);
				}
			}

            /*找到Media资产后进行异步加载*/
			localizedStreamHandle = audioDevice->GetStreamableManager().RequestAsyncLoad(localizedDataPath, [this, Function] {
				onLocalizedDataLoaded();

				if (Function)
				{
					Function(localizedStreamHandle.IsValid());
				}
			});
		}
	}
}
```


## UAkMediaAsset
1. ### UAkMediaAsset的加载主要是填充AkSourceSettings结构，将Media文件的内存地址传给Wwise

```cpp
void UAkMediaAsset::Load()
{
	loadMedia();
}

void UAkMediaAsset::loadMedia()
{
	auto assetData = getMediaAssetData();
	if (!assetData || assetData->DataChunks.Num() <= 0)
	{
		return;
	}

    /*获取Media数据块大小*/
	auto& DataChunk = assetData->DataChunks[0];
	if (assetData->IsStreamed && !DataChunk.IsPrefetch)
	{
		return;
	}

#if !WITH_EDITOR
	if (DataChunk.Data.GetBulkDataSize() <= 0 || !DataChunk.Data.IsAvailableForUse())
	{
		return;
	}
#endif

	auto audioDevice = FAkAudioDevice::Get();
	if (!audioDevice)
	{
		return;
	}

    /*获取数据块*/
#if WITH_EDITOR
	const void* bulkMediaData = DataChunk.Data.LockReadOnly();
#else
	RawMediaData = DataChunk.Data.Lock(LOCK_READ_ONLY);
#endif

	auto dataBulkSize = DataChunk.Data.GetBulkDataSize();

#if WITH_EDITOR
    /*编辑器模式下复制数据块*/
	EditorMediaData.Reset(dataBulkSize);
	RawMediaData = EditorMediaData.GetData();
	FMemory::Memcpy(RawMediaData, bulkMediaData, dataBulkSize);
	DataChunk.Data.Unlock();
#endif

    /*填充AkSourceSettings*/
	AkSourceSettings sourceSettings
	{
		Id, reinterpret_cast<AkUInt8*>(RawMediaData), static_cast<AkUInt32>(dataBulkSize)
	};

#if AK_SUPPORT_DEVICE_MEMORY
	if (assetData->UseDeviceMemory)
	{
		MediaDataDeviceMemory = (AkUInt8*)AKPLATFORM::AllocDevice(dataBulkSize, 0);
		if (MediaDataDeviceMemory)
		{
			FMemory::Memcpy(MediaDataDeviceMemory, RawMediaData, dataBulkSize);
			sourceSettings.pMediaMemory = MediaDataDeviceMemory;
		}
		else
		{
			UE_LOG(LogAkAudio, Error, TEXT("Allocating device memory failed!"))
		}
	}
#endif

    /*将Media数据块与Wwise挂钩*/
	if (audioDevice->SetMedia(&sourceSettings, 1) != AK_Success)
	{
		UE_LOG(LogAkAudio, Log, TEXT("SetMedia failed for ID: %u"), Id);
	}

#if !WITH_EDITOR
	DataChunk.Data.Unlock();
#endif
}
```

## UAkGroupValue
1. ### UAkGroupValue的加载主要是广播代理，将资产地址传给已经绑定的UAkAudioEvent，进行Switch关联资产的加载
```cpp
void UAkGroupValue::PostLoad()
{
	Super::PostLoad();

	if (!HasAnyFlags(RF_ClassDefaultObject))
	{
		GetPathName(nullptr, packagePath);

		if (auto* audioDevice = FAkAudioDevice::Get())
		{
			audioDevice->OnLoadSwitchValue.Broadcast(packagePath);
		}
	}
}

void UAkAssetDataSwitchContainer::loadSwitchValue(const FSoftObjectPath& path, UAkAssetDataSwitchContainerData* switchContainer)
{
	if (switchContainer)
	{
        /*通过资产地址比对确认关联的Switch资产*/
		if (switchContainer->GroupValue.ToSoftObjectPath() == path)
		{
			if (!switchContainer->streamHandle.IsValid())
			{
                /*加载关联Media*/
				loadSwitchContainerMedia(switchContainer);
			}
            /*加载子Data数据关联的Media*/
			loadSwitchContainer(switchContainer->Children);
		}
		else if (IsValid(switchContainer->GroupValue.Get()))
		{
			loadSwitchValue(path, switchContainer->Children);
		}
	}
}
```

## UAkAudioBank
1. ### 现在的UAkAudioBank就像没有Event信息的UAkAudioEvent，整个加载流程和UAkAudioEvent没有区别，可以看到```GroupInAudioBank```命令也只是填充UAkAudioEvent的RequiredBank数据以支持legency load/unload方式。

```cpp
void FAssetTypeActions_AkAudioEvent::GroupIntoSoundBank(TArray<TWeakObjectPtr<UAkAudioEvent>> Objects)
{
	TSharedPtr<SAkAudioBankPicker> WindowContent;

	TSharedRef<SWindow> Window = SNew(SWindow)
		.Title(LOCTEXT("WindowTitle", "Select Sound Bank"))
		.SizingRule(ESizingRule::Autosized)
		;

	Window->SetContent
	(
		SAssignNew(WindowContent, SAkAudioBankPicker)
		.WidgetWindow(Window)
	);

	TSharedPtr<SWindow> ParentWindow;

	if (FModuleManager::Get().IsModuleLoaded("MainFrame"))
	{
		IMainFrameModule& MainFrame = FModuleManager::LoadModuleChecked<IMainFrameModule>("MainFrame");
		ParentWindow = MainFrame.GetParentWindow();
	}

	FSlateApplication::Get().AddModalWindow(Window, ParentWindow, false);

	if (WindowContent->SelectedAkEventGroup.IsValid())
	{
		/*创建事件的RequiredBank引用*/
		for (auto& weakEventPtr : Objects)
		{
			weakEventPtr->RequiredBank = Cast<UAkAudioBank>(WindowContent->SelectedAkEventGroup.GetAsset());
			weakEventPtr->MarkPackageDirty();
		}
	}
}
```

# 卸载流程
* ### 卸载流程基本按照 ```资源卸载检查```/```内存释放```/```引用解除```步骤进行

![](/img/in-post/EBP/Unload.png)
 
```cpp

/*UAkAssetData负责释放对应Data的内存，解除引用*/
AKRESULT UAkAssetData::Unload()
{
	if (BankID == AK_INVALID_BANK_ID)
		return Data.GetBulkDataSize() == 0 ? AK_Success : AK_Fail;

	if (auto AudioDevice = FAkAudioDevice::Get())
	{
		AudioDevice->UnloadBankFromMemory(BankID, RawData);
	}

	BankID = AK_INVALID_BANK_ID;
	RawData = nullptr;
	return AK_Success;
}

/*UAkAssetDataWithMedia执行FStreamableHandle的释放，其实就是Media资产的释放与对应引用的解除*/
AKRESULT UAkAssetDataWithMedia::Unload()
{
	auto result = Super::Unload();
	if (result != AK_Success)
		return result;

	if (!mediaStreamHandle.IsValid())
		return result;

	mediaStreamHandle->ReleaseHandle();
	mediaStreamHandle.Reset();
	return result;
}

/*UAkAssetDataSwitchContainer执行Switch关联Medias的释放*/
void UAkAssetDataSwitchContainer::unloadSwitchContainerMedia(UAkAssetDataSwitchContainerData* switchContainer)
{
	if (switchContainer)
	{
		if (switchContainer->streamHandle.IsValid())
		{
			switchContainer->streamHandle->ReleaseHandle();
			switchContainer->streamHandle.Reset();
		}

		unloadSwitchContainerMedia(switchContainer->Children);
	}
}
```
```cpp
/*本地化资源的卸载，找到关联的AssetData执行Unload操作*/
void UAkAudioEvent::unloadLocalizedData()
{
	if (auto* eventData = Cast<UAkAudioEventData>(getAssetData()))
	{
		if (eventData->LocalizedMedia.Num() > 0)
		{
			if (auto* audioDevice = FAkAudioDevice::Get())
			{
				if (auto* localizedData = eventData->LocalizedMedia.Find(audioDevice->GetCurrentAudioCulture()))
				{
					(*localizedData)->Unload();
				}
			}
		}
		else
		{
			/*没有找到本地化文件关联的AssetData，但是已经加载了，则通过StreamHandle执行Media的释放*/
			if (localizedStreamHandle.IsValid())
			{
				Super::Unload();

				CurrentLocalizedPlatformData = nullptr;

				localizedStreamHandle->ReleaseHandle();
				localizedStreamHandle.Reset();
			}
		}
	}
}
```

# Split Switch Container Media

* ### 对我来说，EBP最有优势的功能便是基于Switch/State的资源加载/卸载。因为不是所有项目都会运用大量的Switch或者嵌套很深的Switch层级，所以也做了全局设置开关。

![](/img/in-post/EBP/SplitSwitchSetting.png)

* ### 没有开启```SplitSwitchContainerMedia```之前事件的引用

![](/img/in-post/EBP/SplitSwitchRef01.png)

* ### 开启```SplitSwitchContainerMedia```之后事件的引用

![](/img/in-post/EBP/SplitSwitchRef02.png)

* ### 可以看到开启后Event与Switch资产有了引用关系，Switch资产的加载/卸载会通过之前```注册的代理```通知关联的事件进行相关资源的加载/卸载

1. ### 可以简单看下SplitSwitchContainerMedia状态对于解析生成SoundData的影响

```cpp
void AkSoundDataBuilder::Init()
{
	assetRegistryModule = &FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry");
	assetToolsModule = &FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools");

	basePackagePath = AkUnrealHelper::GetBaseAssetPackagePath();
	localizedPackagePath = AkUnrealHelper::GetLocalizedAssetPackagePath();

	/*AkSoundDataBuilder初始化的时候会读取这个状态的设置值，所以更改完设置记得重启引擎*/
	if (auto akSettings = GetDefault<UAkSettings>())
	{
		splitSwitchContainerMedia = akSettings->SplitSwitchContainerMedia;
	}

	wwiseProjectInfo.Parse();

	cacheDirectory = wwiseProjectInfo.CacheDirectory();
	defaultLanguage = wwiseProjectInfo.DefaultLanguage();

	if (!AkAssetDatabase::Get().IsInited())
	{
		AkAssetDatabase::Get().Init();
	}
}

/*这里是解析WAAPI传过来的JSON数据，然后填充UAkAudioEvent*/
bool AkSoundDataBuilder::parseAssetInfo(UAkAudioEvent* akEvent, UAkAssetData* platformData, const FString& platform, const FString& language, const TSharedPtr<FJsonObject>& soundBankData, MediaToCookMap& mediaToCookMap)
{
	bool changed = false;

	if (auto* eventPlatformData = Cast<UAkAudioEventData>(platformData))
	{
		const TArray<TSharedPtr<FJsonValue>>* eventsArray = nullptr;
		if (soundBankData->TryGetArrayField("IncludedEvents", eventsArray))
		{
			for(auto& eventJsonValue : *eventsArray)
			{
				auto& eventJson = eventJsonValue->AsObject();
				FString eventStringId = eventJson->GetStringField("GUID");

				FGuid eventId;
				FGuid::ParseExact(eventStringId, EGuidFormats::DigitsWithHyphensInBraces, eventId);

				if (eventId == akEvent->ID)
				{
					changed |= parseEventInfo(akEvent, eventPlatformData, eventJson);
					changed |= parseMedia(eventJson, mediaToCookMap, eventPlatformData->MediaList, platform, false);

					/*UAkAssetData的SwitchContainer数组是清空的*/
					eventPlatformData->SwitchContainers.Empty();

					/*如果需要SplitSwitchMedia才会创建新的UAkAssetDataSwitchContainerData对象，初始化后加入UAkAssetData的SwitchContainer数组中*/
					if (splitSwitchContainerMedia)
					{
						const TArray<TSharedPtr<FJsonValue>>* switchContainers = nullptr;
						/*获取JASON数据中的SwitchContainer对象值*/
						if (eventJson->TryGetArrayField("SwitchContainers", switchContainers))
						{	
							for (auto& switchContainerValueJson : *switchContainers)
							{
								/*对获取到的每个SwitchContainer对象，生成并解析新的UAkAssetDataSwitchContainerData对象，然后添加到事件的AssetData的SwitchContainers中*/
								auto& switchContainerJson = switchContainerValueJson->AsObject();

								UAkAssetDataSwitchContainerData* switchContainerEntry = NewObject<UAkAssetDataSwitchContainerData>(eventPlatformData);
								parseSwitchContainer(switchContainerJson, switchContainerEntry, eventPlatformData->MediaList, eventPlatformData);
								eventPlatformData->SwitchContainers.Add(switchContainerEntry);
							}
						}

						changed = true;
					}

					break;
				}
			}
		}
	}

	return changed;
}
```

```cpp
/*解析SwitchContainer，通过WAAPI获取SwitchContainer对象中子对象的值并填充UAkAssetDataSwitchContainerData*/
void AkSoundDataBuilder::parseSwitchContainer(const TSharedPtr<FJsonObject>& switchContainerJson, UAkAssetDataSwitchContainerData* switchContainerEntry, TArray<TSoftObjectPtr<UAkMediaAsset>>& mediaList, UObject* parent)
{
	/*解析填充GroupValue值*/
	FString stringSwitchValue = switchContainerJson->GetStringField("SwitchValue");
	FGuid switchValueGuid;
	FGuid::ParseExact(stringSwitchValue, EGuidFormats::DigitsWithHyphensInBraces, switchValueGuid);

	if (auto groupValueIt = AkAssetDatabase::Get().GroupValueMap.Find(switchValueGuid))
	{
		switchContainerEntry->GroupValue = *groupValueIt;
	}

	/*解析填充MediaList值*/
	const TArray<TSharedPtr<FJsonValue>>* jsonMediaList = nullptr;
	if (switchContainerJson->TryGetArrayField("Media", jsonMediaList))
	{
		for (auto& mediaJsonValue : *jsonMediaList)
		{
			auto& mediaJsonObject = mediaJsonValue->AsObject();

			FString stringId = mediaJsonObject->GetStringField("Id");
			uint32 mediaFileId = static_cast<uint32>(FCString::Atoi64(*stringId));

			FSoftObjectPath* mediaAssetPath = nullptr;

			{
				FScopeLock autoLock(&mediaLock);
				mediaAssetPath = mediaIdToAssetPath.Find(mediaFileId);
			}

			if (mediaAssetPath)
			{
				switchContainerEntry->MediaList.Emplace(*mediaAssetPath);

				mediaList.RemoveAll([mediaAssetPath](const TSoftObjectPtr<UAkMediaAsset>& item) {
					return item.GetUniqueID() == *mediaAssetPath;
				});
			}
		}
	}

	/*递归解析嵌套的子Switch对象*/
	const TArray<TSharedPtr<FJsonValue>>* children = nullptr;
	if (switchContainerJson->TryGetArrayField("Children", children))
	{
		for (auto& childJsonValue : *children)
		{
			auto& childJsonObject = childJsonValue->AsObject();

			UAkAssetDataSwitchContainerData* childEntry = NewObject<UAkAssetDataSwitchContainerData>(parent);
			parseSwitchContainer(childJsonObject, childEntry, mediaList, parent);
			switchContainerEntry->Children.Add(childEntry);
		}
	}
}
```
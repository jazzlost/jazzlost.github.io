---
layout: post
title: "Wwise声音引擎的初始化"
subtitle: "The Initializaiton of Wwise Sound Engine"
author: "李AA"
header-img: "img/blog-theme.jpg"
tags:
    - Wwise
---

* TOC
{:toc}


# 初始化顺序
  1. Memory hook文件
  2. Memory Manager
  3. Streaming Manager
  4. Sound Engine
  5. Music Engine
  6. Communication

# MemoryHook
* 在AkTypes.h文件中有以下extern声明，具体定义自己根据系统和需求实现

```cpp
	namespace AK
	{  
	    AK_EXTERNFUNC( void *, AllocHook )( size_t in_size);      ///< Number of bytes to allocate

	    AK_EXTERNFUNC( void, FreeHook )(void * in_pMemAddress);	 ///< Pointer to the start of memory allocated with AllocHook			  
	}
```
* 可以参考一下Unreal Engine4的集成，通过UnrealMemory中的接口在AkAudioDevice.cpp中有实现

```cpp

	namespace AK
	{
		void * AllocHook( size_t in_size )
		{
			//FMemory声明在Runtime/Core/Public/HAL/UnrealMemory.h
			return FMemory::Malloc( in_size );
		}
		void FreeHook( void * in_ptr )
		{
			FMemory::Free( in_ptr );             
		}

	#ifdef _WIN32 // only on PC and XBox360, 这个两个回调函数非必须，可能会在Stream Manager的I/O Pool中用到
		void * VirtualAllocHook(
			void * in_pMemAddress,
			size_t in_size,
			unsigned long in_dwAllocationType,
			unsigned long in_dwProtect
			)
		{
			return VirtualAlloc( in_pMemAddress, in_size, in_dwAllocationType, in_dwProtect );
		}
		void VirtualFreeHook( 
			void * in_pMemAddress,
			size_t in_size,
			unsigned long in_dwFreeType
			)
		{
			VirtualFree( in_pMemAddress, in_size, in_dwFreeType );
		}
	#endif // only on PC and XBox360

	#if PLATFORM_SWITCH //Switch平台
		void * AlignedAllocHook(size_t in_size, size_t in_alignment)
		{
			return aligned_alloc(in_alignment, in_size);
		}

		void AlignedFreeHook(void * in_ptr)
		{
			free(in_ptr);
		}
	#endif


	#if PLATFORM_XBOXONE //XBoxOne
		void * APUAllocHook( 
			size_t in_size,				///< Number of bytes to allocate.
			unsigned int in_alignment	///< Alignment in bytes (must be power of two, greater than or equal to four).
			)
		{
			void * pReturn = nullptr;
			ApuAlloc( &pReturn, NULL, (UINT32) in_size, in_alignment );
			return pReturn;
		}

		void APUFreeHook( 
			void * in_pMemAddress	///< Virtual address as returned by APUAllocHook.
			)
		{
			ApuFree( in_pMemAddress );
		}
	#endif
	}
```

# Memory Manager
* 然后最先初始化内存管理

```cpp
	#include <AK/SoundEngine/Common/AkMemoryMgr.h>     //Memory Manager     
	#include <AK/SoundEngine/Common/AkModule.h>      //Default memory and stream managers           
	(...)

	bool InitSoundEngine()
	{
	    AkMemSettings memSettings;
	    memSettings.uMaxNumPools = 20;

	    if ( AK::MemoryMgr::Init( &memSettings ) != AK_Success )
	    {
	        assert( ! "Could not create the memory manager." );
	        return false;
	    }
	
	    (...)
	}
```

* 参考Unreal4中设置, 把所有初始化设置放在EnsureInitialized()

```cpp
	bool FAkAudioDevice::EnsureInitialized()
	{
	   (...)

		AkMemSettings memSettings;
		memSettings.uMaxNumPools = 256;

		if ( AK::MemoryMgr::Init( &memSettings ) != AK_Success )
		{
	    	  return false;
		}
	}
```
* Wwise声音引擎的所有内存访问功能都是通过Ak::MemoryMgr这个接口类。默认的实现封装在AkMemoryMgr.lib中。Ak::MemoryMgr::Init()的申明放在AkModule.h。整个AkMemoryMgr接口可以Override,这里不做讨论。

# Streaming Manager
  * Wwise官方推荐的集成方式是使用默认的Stream Manager实现，然后实现AkStreamMgrModule.h中的接口。这些接口是Low-Level IO的组成部分。

  * 总结Stream Manager初始化流程为：
    1. 创建StreamMgr对象
    2. 创建并修改AkDevice设置
    3. 创建I/O Hook
    4. 用Hook对象和AkDevice设置来初始化Stream Device。至少有一个初始化过的Stream Device对象，Stream Manager才能正常工作。
   
	```cpp
		#include <AK/SoundEngine/Common/IAkStreamMgr.h>                 // Streaming Manager
		#include <AK/Tools/Common/AkPlatformFuncs.h>                    // Thread defines
		#include <AkFilePackageLowLevelIOBlocking.h>                    // Sample low-level I/O implementation


		CAkFilePackageLowLevelIOBlocking g_lowLevelIO;  //这里的IO Hook实现用的是SDK示例工程中的实现，Wwise SDK\版本号\SDK\samples\SoundEngine\Win32

		(...)

		bool InitSoundEngine()
		{
		    (...)

		    AkStreamMgrSettings stmSettings;          
		    //创建默认Stream Manager设置对象
		    AK::StreamMgr::GetDefaultSettings( stmSettings );  

		    //这里可以做设置修改

		    //用设置初始化Stream Manager对象
			if ( !AK::StreamMgr::Create( stmSettings ) )
		    {
		        assert( ! "Could not create the Streaming Manager" );
		        return false;
		    }

		    AkDeviceSettings deviceSettings;
		    //创建默认Device设置对象
			AK::StreamMgr::GetDefaultDeviceSettings( deviceSettings );

		    //这里可以做设置修改

			//用Hook对象和设置初始化Stream Device
		    if ( g_lowLevelIO.Init( deviceSettings ) != AK_Success )
		    {
		        assert( ! "Could not create the streaming device and Low-Level I/O system" );
		        return false;
		    }

		    (...)
		}
	```
  * 参考一下Unreal4的集成

	```cpp
		bool FAkAudioDevice::EnsureInitialized()
		{
		   (...)

			AkStreamMgrSettings stmSettings;
			//创建默认Stream Manager设置对象
			AK::StreamMgr::GetDefaultSettings( stmSettings );
			//用设置初始化Stream Manager对象
			AK::IAkStreamMgr * pStreamMgr = AK::StreamMgr::Create( stmSettings );
			if ( ! pStreamMgr )
			{
		        return false;
			}

			AkDeviceSettings deviceSettings;
			//创建默认Device设置对象
			AK::StreamMgr::GetDefaultDeviceSettings( deviceSettings );

		    //device设置自定义
			deviceSettings.uGranularity = AK_UNREAL_IO_GRANULARITY;
			deviceSettings.uSchedulerTypeFlags = AK_SCHEDULER_DEFERRED_LINED_UP;
			deviceSettings.uMaxConcurrentIO = AK_UNREAL_MAX_CONCURRENT_IO;

		#if PLATFORM_MAC
			deviceSettings.threadProperties.uStackSize = 4 * 1024 * 1024; // From FRunnableThreadMac
		#elif PLATFORM_APPLE
			deviceSettings.threadProperties.uStackSize = 256 * 1024; // From FRunnableThreadApple
		#elif PLATFORM_SWITCH
			deviceSettings.threadProperties.uStackSize = 1 * 1024 * 1024;
		#endif

			//这里用的I/O Hook实现在AkUnrealIOHookDeferred.cpp
			LowLevelIOHook = new CAkFilePackageLowLevelIO<CAkUnrealIOHookDeferred, CAkDiskPackage, AkFileCustomParamPolicy>();
			//用Hook对象和设置初始化Stream Device
		    if (!LowLevelIOHook->Init( deviceSettings ))
			{
				delete LowLevelIOHook;
				LowLevelIOHook = nullptr;
		        return false;
			}
		}
	```
# Sound Engine
  * 前两项初始化成功后就可以初始化Sound Engine了
	
	```cpp

		#include <AK/SoundEngine/Common/AkSoundEngine.h>                // Sound engine

		bool InitSoundEngine()
		{
		    (...)

		    AkInitSettings initSettings;
		    AkPlatformInitSettings platformInitSettings;
		    //创建引擎默认初始化设置
			AK::SoundEngine::GetDefaultInitSettings( initSettings );
		    //创建引擎默认平台初始化设置
			AK::SoundEngine::GetDefaultPlatformInitSettings( platformInitSettings );

			//这里可以自定义设置

			//用引擎和平台设置来初始化引擎 
		    if ( AK::SoundEngine::Init( &initSettings, &platformInitSettings ) != AK_Success )
		    {
		        assert( ! "Could not initialize the Sound Engine." );
		        return false;
		    }

		    (...)
		}
	```

  * 参考Unreal4集成
	
	```cpp
		bool FAkAudioDevice::EnsureInitialized()
		{
		   (...)

		   AkInitSettings initSettings;
			AkPlatformInitSettings platformInitSettings;
			//创建引擎默认初始化设置
			AK::SoundEngine::GetDefaultInitSettings( initSettings );
			//创建引擎默认平台初始化设置
			AK::SoundEngine::GetDefaultPlatformInitSettings( platformInitSettings );

			//自定义设置
			initSettings.eFloorPlane = AkFloorPlane_XY;

		#if !(PLATFORM_ANDROID || PLATFORM_IOS)
			// Keep default size on mobile platforms.
			platformInitSettings.uLEngineDefaultPoolSize = 128 * 1024 * 1024;
		#endif

		#if PLATFORM_ANDROID && !PLATFORM_LUMIN
			extern JavaVM* GJavaVM;
			platformInitSettings.pJavaVM = GJavaVM;
			platformInitSettings.jNativeActivity = FAndroidApplication::GetGameActivityThis();
		#endif
		#if defined AK_WIN
			// OCULUS_START vhamm audio redirect with build of wwise >= 2015.1.5
			if (IHeadMountedDisplayModule::IsAvailable())
			{
				FString AudioOutputDevice;
				IHeadMountedDisplayModule& Hmd = IHeadMountedDisplayModule::Get();
				AudioOutputDevice = Hmd.GetAudioOutputDevice();
				if(!AudioOutputDevice.IsEmpty())
					initSettings.settingsMainOutput.idDevice = AK::GetDeviceIDFromName((wchar_t*)*AudioOutputDevice);
			}
			// OCULUS_END

		#endif

			const UAkSettings* AkSettings = GetDefault<UAkSettings>();
			if (AkSettings && AkSettings->bEnableMultiCoreRendering)
			{
				initSettings.taskSchedulerDesc.fcnParallelFor = AkUE4_ParallelForFunc;

				check(FTaskGraphInterface::Get().IsRunning());
				check(FPlatformProcess::SupportsMultithreading());
				check(ENamedThreads::bHasHighPriorityThreads);

				initSettings.taskSchedulerDesc.uNumSchedulerWorkerThreads =	FTaskGraphInterface::Get().GetNumWorkerThreads();
			}

		    ////用引擎和平台设置来初始化引擎 
			if ( AK::SoundEngine::Init( &initSettings, &platformInitSettings ) != AK_Success )
			{
		        return false;
			}
		}
	```
# Music Engine
  * 如果游戏用到Wwise的互动音乐部分，则需要初始化Music Engine
	
	```cpp

		#include <AK/MusicEngine/Common/AkMusicEngine.h>                // Music Engine

		bool InitSoundEngine()
		{
		    (...)

		    AkMusicSettings musicInit;
		    //创建默认Music Engine设置
			AK::MusicEngine::GetDefaultInitSettings( musicInit );

		    //这里可以自定义设置

			//用Music Engine设置初始化Music Engine
			if ( AK::MusicEngine::Init( &musicInit ) != AK_Success )
		    {
		        assert( ! "Could not initialize the Music Engine." );
		        return false;
		    }

		    (...)
		}
	```

  * 参考Unreal4集成
	
	```cpp
		bool FAkAudioDevice::EnsureInitialized()
		{
		   (...)

			AkMusicSettings musicInit;
			//创建默认Music Engine设置
			AK::MusicEngine::GetDefaultInitSettings( musicInit );

			//这里可以自定义设置

			//用Music Engine设置初始化Music Engine
			if ( AK::MusicEngine::Init( &musicInit ) != AK_Success )
			{
		        return false;
			}

			//这里还初始化了空间组件
			AkSpatialAudioInitSettings spatialAudioInit;
			if ( AK::SpatialAudio::Init(spatialAudioInit) != AK_Success)
			{
				return false;
			}
		}
	```

# Communications
  * 如果你想用Wwise Authoring Application来连接到游戏进行profiling和mixing，你就需要继续初始化communications模块。这是个很好用的Debug模块，建议初始化，但是记得在Release版本中关闭。

	```cpp
		#ifndef AK_OPTIMIZED
		    #include <AK/Comm/AkCommunication.h>
		#endif // AK_OPTIMIZED

		bool InitSoundEngine()
		{
		    (...)

		//Release版本中关闭
		#ifndef AK_OPTIMIZED

		    AkCommSettings commSettings;
		    //创建commm默认设置
		    AK::Comm::GetDefaultInitSettings( commSettings );

			//这里可以自定义设置

			//用设置初始化comm模块
		    if ( AK::Comm::Init( commSettings ) != AK_Success )
		    {
		        assert( ! "Could not initialize communication." );
		        return false;
		    }
		#endif // AK_OPTIMIZED

		    (...)
		}
	```

  * Unreal4集成中按平台和版本做了一些自定义设置
	
	```cpp
	
		//Release版本中关闭
		#ifndef AK_OPTIMIZED
		#if !PLATFORM_LINUX
		#if UE_4_18_OR_LATER
			const bool HasProjectName = FApp::HasProjectName();
		#else
			const bool HasProjectName = FApp::HasGameName();
		#endif // UE_4_18_OR_LATER
	
			if(HasProjectName)
			{
		#if UE_4_18_OR_LATER
				FString GameName = FApp::GetProjectName();
		#else
				FString GameName = FApp::GetGameName();
		#endif // UE_4_18_OR_LATER
	
		#if WITH_EDITORONLY_DATA
				if(!IsRunningGame())
					GameName += TEXT(" (Editor)");
		#endif
				AkCommSettings commSettings;
				//用设置初始化comm模块
				AK::Comm::GetDefaultInitSettings( commSettings );
		#if PLATFORM_SWITCH
				//自定义设置
				commSettings.bInitSystemLib = false;
		#endif
				FCStringAnsi::Strcpy(commSettings.szAppNetworkName, AK_COMM_SETTINGS_MAX_STRING_SIZE, TCHAR_TO_ANSI(*GameName));
				//用设置初始化comm模块
				if ( AK::Comm::Init( commSettings ) != AK_Success )
				{
					UE_LOG(LogInit, Warning, TEXT("Could not initialize communication. GameName is %s"), *GameName);
					//return false;
				}
			}
		#endif
		#endif
	```
  * Wwise提供了一个固定通信端口，两个动态通信端口。固定端口是AkCommSetting::Ports::uDiscoveryBroadcast。动态端口是AkCommSettings::Ports::uCommand,AkCommSettings::Ports::uNotification

  * Wwise提供了Integration Demo代码的Init部分也比较有参考意义。




---
layout: post
title: "Wwise-Unreal Intergration中对于Event回调的处理"
subtitle: "Event Callback In Wwise-Unreal Integration"
author: "李AA"
header-img: "img/post-bg-universe.jpg"
tags:
    - Wwise
    - Unreal
---

* TOC
{:toc}

# 前言
* Q: 本文讨论重点是什么？

  A: Wwise Unreal Integration中对于PostEvent接口的设计和扩展

* Q: 本文探讨的初衷

  A: 在看过Wwise给PostEvent做的接口Wrap以后，觉得这种设计值得学习借鉴

* 这个结构简化了原本集成中的一些参数和功能，意在简略表现设计思路 

![](\img\in-post\PostEventInWwiseUnrealIntegration\CallbackTest.png)

# EventCallbackPackage
* 回调函数打包类。这个接口类接受用户传递的回调函数和附加参数，其子类实现一个HandleAction函数，这个函数中会用我们传递的回调参数来调用我们自定义的回调函数，同时也可以添加一些自定义功能

```cpp
	//  回调函数签名
	typedef void(*CallbackFunc)(void *in_pCookie); 
	//  接口类
	class IEventCallbackPackage
	{
	public:
		virtual void HandleAction() = 0;
	};
	//  具体回调打包函数的定义
	class CEventCallbackPackage : public IEventCallbackPackage
	{
	public:
		//  in_pCallback是用户定义回调函数，in_pCookie是用户定义回调参数(可选)，packageNum是用户定义其它传递值(可选)
	    CEventCallbackPackage(CallbackFunc in_pCallback, void *in_pCookie, int packageNum) : in_pCallbackFunc(in_pCallback), 	in_pCookie(in_pCookie), packageNum(packageNum) {}

		//  具体的HandleAction行为，可以通过继承定义多个。我们这里打印字符和package number
		virtual void HandleAction() override
		{
			in_pCallbackFunc(in_pCookie);
			std::cout << packageNum << std::endl;
		}

	private:
		CallbackFunc in_pCallbackFunc;
		void *in_pCookie;
		int packageNum;
	};
```

# CallbackManager
* 回调管理类。这里是创建具体的回调包，以及对打好的回调包进一步包装成更高层的回调函数

```cpp
	class CallbackManager
	{
	public:
		//  创建回调包
	    IEventCallbackPackage *CreateCallbackPackage(CallbackFunc in_pCallback, void *in_pCookie, int packageNum)
		{
			IEventCallbackPackage *package = new CEventCallbackPackage(in_pCallback, in_pCookie, packageNum);
			return package;
		}
	    //  包触发器，出发包内的函数调用
		static void AudioEventCallbackFunc(void *cb_package)
		{
			if (cb_package)
			{
				auto package = (IEventCallbackPackage *)cb_package;
				if (package)
					package->HandleAction();
			}
		}
	};
```

# AudioDevice
* 业务逻辑类。具体的PostEvent业务在这里调用,聚合CallbackManager类，同时依赖Wwise SDK中的PostEvent接口

```cpp
	class AudioDevice
	{
	public:
		AudioDevice( ): callBackManager(new CallbackManager()){}

		void AudioEventPost(CallbackFunc in_pCallback, void *in_pCookie, int packageNum)
		{
			//  通过lambda函数调用CreateCallbackPackage来打包
			AudioEventPost(packageNum, [this,in_pCallback, in_pCookie](int packageNum) { return 	callBackManager->CreateCallbackPackage(in_pCallback, in_pCookie, packageNum); });
		}
	private:
		template <typename CallbackPackage>
		void AudioEventPost(int packageNum, CallbackPackage createPackage)
		{
			auto cb_package = createPackage(packageNum);
			if (cb_package)
			{
				AK::GetAK()->PostEvent(&
				//  将打好的包放入包触发器中
				CallbackManager::AudioEventCallbackFunc, cb_package);
			}
		}

		CallbackManager *callBackManager;
	};
```
# AK::SounEngine::PostEvent

```cpp
	//  Wwise原本的PostEvent接口
	AkPlayingID AK::SoundEngine::PostEvent
	(AkUniqueID in_eventID,
	AkGameObjectID in_gameObjectID,
	AkUInt32 in_uFlags = 0,
	AkCallbackFunc in_pfnCallback = NULL,
	void* in_pCookie = NULL,
	AkUInt32 in_cExternals = 0,
	AkExternalSourceInfo *in_pExternalSources = NULL,
	AkPlayingID in_PlayingID = AK_INVALID_PLAYING_ID)

	//  因为我们主要验证PostEvent的Callback部分，而且要调用Wwise还要初始化SounEngine。所以我们就简化了原接口
	class AK
	{
	public:
		void PostEvent(CallbackFunc in_pCallback, void *in_pCookie)
		{
			in_pCallback(in_pCookie);
		}

		static AK* GetAK()
		{
			static AK* AKDevice;
			return AKDevice;
		}
	private:
		AK();
		~AK();
		AK(const AK&);
		AK& operator=(const AK&);
	};
```

# 测试

```cpp
	//  自定义回调参数类型
	struct Cookie
	{
		std::string s;
	};

	//  自定义回调函数，签名需要和AKCallbackFunc一致
	void myCallbackFun(void *cookie)
	{
		auto out_pCookie = (Cookie *)cookie;
		std::cout << out_pCookie->s << std::endl;
	}

	int main()
	{
		//  实例化cookie
		Cookie *p_cookie = new Cookie{"The Callback From Cookie! And The Package Number Is ";}
		//  实例化AudioDevice
		AudioDevice* audioDevice = new AudioDevice();

		audioDevice->AudioEventPost(&myCallbackFun, p_cookie, 8);

		getchar();

		delete p_cookie;
		delete audioDevice;

		return 0;
	}
```
![](\img\in-post\PostEventInWwiseUnrealIntegration\result.png)


# Wwise中Music回调的测试
*  这里提供一个事件回调的具体测试，在music的每一拍进行一个回调获取拍速信息

*  演示视频
	<iframe src="//player.bilibili.com/player.html?aid=61132249&cid=106362548&page=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" width="800" height="600"> </iframe>


* ![AkCallbackInfo](\img\in-post\PostEventInWwiseUnrealIntegration\AkCallbackInfo.png)


# 总结
* AK::SoundEngine::PostEvent()接口接收一个自定义回调函数和一个回调参数。集成中通过一个打包类接口来扩展自定义的回调函数，最后传递给PostEvent一个打好的回调包以及一个包触发器函数。这样的实现体现了开放封闭原则，增强了可扩展性。
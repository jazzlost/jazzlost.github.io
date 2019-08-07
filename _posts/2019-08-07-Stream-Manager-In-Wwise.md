---
layout: post
title: "Wwisez中的流管理系统"
subtitle: "Stream Manager In Wwise"
author: "李AA"
header-img: "img/post-bg-music-header_745px.jpg"
tags:
    - Wwise
---

* TOC
{:toc}


# 前言
* Q: 本文讨论初衷？

* 刚接触Wwise的文件和```数据流管理系统```时，一般无法理清各模块的作用和关系。虽然不妨碍使用(Wwise提供了一些实现文件)，但是对于后期在文件管理的自定义或者优化方面会有阻碍。

* Q: 本文讨论主题？

* ```流管理器(Stream Manager)```的底层和高层模块，以及他们之间的协调使用，本文不讨论底层模块的重写实现。


# 结构
* 在游戏引擎中的架构

![](/img/in-post/StreammanagerInWwise/ArchitectInGame.png)

* StreamManager UML

![](/img/in-post/StreammanagerInWwise/StreamManagerUML.gif)

* Q: 有几组公共接口？
* Wwise在结构上定义了两组。底层接口```IAkLowLevelIO(LowLevelO)```以及高层接口```IAkStreamMgr(WwiseIO)```。但是可以完全替换为自己的流管理架构。

* Q: LowLevelIO模块作用？
  1. 解析文件在磁盘中的位置
  2. Stream Manager用到的调度操作定义
* Q: LowLevelIO模块有哪几部分？
  1. [IO Hook](#io-hook)
  2. [File Location Resolver](#file-location-resolver)
  3. [Stream Manager](#stream-manager)



* ```Q: WwiseIO系统的创建步骤？```
  1. 实现IAkLowLevelHook(IAkIOHookBlocking或者IAkIOHookDefereed),并创建IOHook对象
  2. 实现接口文件IAkFileLocationResolver，创建唯一的File Location Resolver对象。
  3. 创建Stream Manager对象, 注册File Location Resolver对象
  4. 创建LowLevelIO
  5. 创建Streaming Device并与LowLevelIO挂钩，在Stream Manager中注册对象
  6. Stream Manager创建标准流或者自动流, StreamingDevice播放

# IO Hook
* Q:模块作用？
* 和```平台IO API```对接，作为Stream Manager和平台IO的```中间层```，提供文件数据的传输。如果游戏引擎已经有了IO模块，推荐用引擎的IO来实现IO Hook。

* Q:相关文件有哪些？
* 接口文件
  * "SDK\include\AK\SoundEngine\Common\AkStreamMgrModule.h"
* IOHook实现(平台相关WwiseIO文件)
  *  "samples\SoundEngine\{Platform name}\AkDefaultIOHookBlocking.h"
  *  "samples\SoundEngine\{Platform name}\AkDefaultIOHookBlocking.cpp"
  *  "samples\SoundEngine\{Platform name}\AkDefaultIOHookDeferred.h"
  *  "samples\SoundEngine\{Platform name}\AkDefaultIOHookDeferred.cpp"
* 多设备IOHook实现
  *  "samples\SoundEngine\Common\AkDefaultLowLevelIODispatcher.h"
  *  "samples\SoundEngine\Common\AkDefaultLowLevelIODispatcher.cpp"
* FilePackage模板(增加对.pck支持的LowLevelIO,模板类)
  *  "samples\SoundEngine\Common\AkFilePackageLowLevelIO.h"
  *  "samples\SoundEngine\Common\AkFilePackageLowLevelIO.inl"
  *  "samples\SoundEngine\Common\AkFilePackage.h"
  *  "samples\SoundEngine\Common\AkFilePackage.cpp"
  *  "samples\SoundEngine\Common\AkFilePackageLUT.h"
  *  "samples\SoundEngine\Common\AkFilePackageLUT.cpp"
* FilePackage实现(平台相关包处理类, 用FilePackage模板类和平台相关WwiseIO来实例化模板）
  *  "samples\SoundEngine\{Platform name}\AkFilePackageLowLevelIOBlocking.h"
  *  "samples\SoundEngine\{Platform name}\AkFilePackageLowLevelIODeferred.h"

* 重要接口

```cpp

// Reads data from a file (synchronous).
virtual AKRESULT Read(
		AkFileDesc& in_fileDesc,    
		const AkIoHeuristics& in_heuristics,
		void* out_pBuffer, 
		AkIOTransferInfo& in_transferInfo)

// Writes data to a file (synchronous). 
virtual AKRESULT Write(
		AkFileDesc& in_fileDesc,
		const AkIoHeuristics& in_heuristics,
		void* in_pData,
		AkIOTransferInfo& io_transferInfo)
```

# File Location Resolver
* 模块作用？
* 负责将文件名称和文件ID映射到文件描述符,填充```AkFileDesc```结构体
* Q:相关文件有哪些？
* 接口文件
  * "SDK\include\AK\SoundEngine\Common\AkStreamMgrModule.h"
* FileLocationResolver实现
  *  "samples\SoundEngine\Common\AkFileLocationBase.h"
  *  "samples\SoundEngine\Common\AkFileLocationBase.cpp"

* 重要接口

```cpp
// Returns a file descriptor for a given file name (string).
virtual AKRESULT Open(
		const AkOSChar*	in_pszFileName,
		AkOpenMode in_eOpenMode,
		AkFileSystemFlags* in_pFlags,
		bool& io_bSyncOpen,
		AkFileDesc& io_fileDesc)

// Returns a file descriptor for a given file ID.
virtual AKRESULT Open(
		AkFileID in_fileID,
		AkOpenMode in_eOpenMode,
		AkFileSystemFlags* in_pFlags,
		bool& io_bSyncOpen,
		AkFileDesc& io_fileDesc)
```


# Stream Manager
* Q: StreamManager模块作用
  1. ```独立于平台```，将平台底层```操作系统```或```硬件```中的文件或其他对象的句柄封装成流文件，可以理解为```流创建器```。
  2. 声音引擎通过StreamManager获取SoundBank和流音频文件,甚至可以用作游戏引擎的IO模块
  3. 若需要定义自己的StreamManager,重写```IAkStreamMgr```里面的接口便可以

* Q: 相关文件有哪些？
* 接口文件
  * "SDK\include\AK\SoundEngine\Common\IAkStreamMgr.h"

* Q: StreamManager创建的流是什么？
* 流创建在底层调用的是```IAkFileLocationResolver::Open()```,然后通过一些流参数设置来控制读写的方式，主要分为标准流和自动流两种。
* 1. 标准流
  * 调用```AK::IAkStreamMgr::CreateStd()```将创建标准流对象
  * 调用流对象的```AK::IAkStdStream::Read()```或```AK::IAkStdStream::Write()```将读写请求传入请求队列。
  * 调用```AK::IAkAutoStream::GetPosition()```获取流指针位置，```AK::IAkAutoStream::SetPosition()```设置流指针位置。
* 2. 自由流
    * 仅用于输入，无需显式调用接口,调用 AK::IAkStreamMgr::CreateAuto() 将创建一个自动流对象。
    * 调用流对象```AK::IAkAutoStream::Start()```时开始将执行 I/O 请求的自动调度。调用```AK::IAkAutoStream::Stop()```停止流。
    * 调用```AK::IAkAutoStream::GetBuffer()```

* Q: 常用的StreamManager操作？

* 下面wrap了一个流管理器的例子，涉及一些常用操作

* ### 标准流

```cpp
//                              这里包装了一个标准流和一个自动流类型

//--------------------------------------------标准流-------------------------------------
class StreamStd
{
public:

	StreamStd(const AkOSChar* in_pszFileName, int bufferSize) :m_pszFileName(in_pszFileName), m_pStream(nullptr)
	{
		m_pStreamMgr = AK::IAkStreamMgr::Get();
	}

	//  流创建
	AKRESULT CreateStreamStd();
	//  Get流对象
	AK::IAkStdStream* GetStream() { if (m_pStream) return m_pStream; }
	//  同步读取
	AKRESULT ReadSync(void* pBuffer, AkUInt32 out_uSize);
	//  异步读取
	AKRESULT ReadAsync(void* pBuffer, AkUInt32 out_uSize);
	//  设置指针位置
	AKRESULT SetPosition(AkInt64 iRealOffset);
	//  写入
	AKRESULT Write(void* pBuffer, AkUInt32 out_uSize);
	//  数据校验
	void CheckDataValidate(AkUInt32 in_uSize);
	//  返回数据流状态
	bool IsSuccess() { return m_bSuccess; }
	//  关闭流
	void Close();

private:
	AK::IAkStreamMgr* m_pStreamMgr;
	AK::IAkStdStream* m_pStream;
	const AkOSChar* m_pszFileName;
	bool m_bSuccess = false;
	AkUInt64 m_CurPosition = 0;
	const AkUInt64 POSITION_BEGIN = 0;
};

//---------------------------------------------------------------------------------
AKRESULT StreamStd::CreateStreamStd()
{
	if (!m_pStreamMgr)
		return AK_Fail;

	AKRESULT res = m_pStreamMgr->CreateStd(
		m_pszFileName,		//文件名
		NULL,				//文件位置解析逻辑，完整路径的话无需
		AK_OpenModeRead,	//创建设置：打开模式
		m_pStream,			//返回的流句柄
		true);				//需要同步打开文件

	return res;
}

AKRESULT StreamStd::ReadSync(void* pBuffer, AkUInt32 out_uSize)
{
	if (!m_pStream)
		return AK_Fail;

	AKRESULT res = m_pStream->Read(
		pBuffer,			//读取buffer地址
		BUFFER_SIZE,		//需要读取的buffer大小
		true,				//同步阻塞处理
		AK_DEFAULT_PRIORITY,//处理优先级
		0,					//请求延迟时间：现在处理
		out_uSize);			//返回实际读取buffer大小

	return res;
}

AKRESULT StreamStd::ReadAsync(void* pBuffer, AkUInt32 out_uSize)
{
	if (!m_pStream)
		return AK_Fail;

	AKRESULT res = m_pStream->Read(
		pBuffer,			//读取buffer地址
		BUFFER_SIZE,		//需要读取的buffer大小
		false,				//非阻塞处理
		AK_DEFAULT_PRIORITY,//处理优先级
		0,					//请求延迟时间：现在处理
		out_uSize);			//返回实际读取buffer大小

	return res;
}

AKRESULT StreamStd::SetPosition(AkInt64 iRealOffset)
{
	if (!m_pStream)
		return AK_Fail;

	AKRESULT res = m_pStream->SetPosition(
		ABS_POSITION,  //偏置量(offset)
		AK_MoveBegin,  //偏置模式：从头计算
		&iRealOffset   //返回实际偏置量
	);

	return res;
}

AKRESULT StreamStd::Write(void* pBuffer, AkUInt32 out_uSize)
{
	if (!m_pStream)
		return AK_Fail;

	AKRESULT res = m_pStream->Write(
		pBuffer,			//写入buffer地址
		BUFFER_SIZE,		//写入buffer大小
		true,				//阻塞处理
		AK_DEFAULT_PRIORITY,//默认优先级
		0,					//请求延迟时间：现在处理
		out_uSize			//返回实际写入buffer大小
	);

	return res;
}

void StreamStd::CheckDataValidate(AkUInt32 in_uSize)
{
	bool bEOF;

	if (!m_pStream)
		return;

	m_pStream->GetPosition(&bEOF);
	if (!bEOF && in_uSize != BUFFER_SIZE)
	{
		m_bSuccess = false;
		std::cerr << "Transfer Size Not Match Data Size" << std::endl;
		Close();
	}
	else if (bEOF)
	{
		m_bSuccess = false;
		std::cerr << "Buffer Overflow" << std::endl;
		Close();
	}
	else
		m_bSuccess = true;
}

void StreamStd::Close()
{
	if (m_pStream)
	{
		m_pStream->Destroy;
		return;
	}
	return;
}
```
* ### 自动流

```cpp
//----------------------------------------------自动流------------------------------------
class StreamAuto
{
public:

	StreamAuto(const AkOSChar* in_pszFileName, int bufferSize, AkAutoStmHeuristics heuristics) :m_pszFileName(in_pszFileName), m_pStream(nullptr), heuristics(heuristics)
	{
		m_pStreamMgr = AK::IAkStreamMgr::Get();
	}

	//  流创建
	AKRESULT CreateStreamAuto();
	//  读取
	AKRESULT GetBuffer(void* pBuffer, AkUInt32 out_uSize);
	//  释放
	AKRESULT ReleaseBuffer();
	//  开始自动流
	AKRESULT Start();
	//  停止自动流
	AKRESULT Stop();
	//  Get流对象
	AK::IAkAutoStream* GetStream() { if (m_pStream) return m_pStream; }
	//  数据校验
	void CheckDataValidate(AkUInt32 uLoopEnd);
	//  返回数据流状态
	bool IsSuccess() { return m_bSuccess; }
	//  关闭流
	void Close();

private:
	AK::IAkStreamMgr* m_pStreamMgr;
	AK::IAkAutoStream* m_pStream;
	const AkOSChar* m_pszFileName;
	AkAutoStmHeuristics heuristics;
	bool m_bSuccess = false;
	AkUInt64 m_CurPosition = 0;
	const AkUInt64 POSITION_BEGIN = 0;
};

//---------------------------------------------------------------------------------
AKRESULT StreamAuto::CreateStreamAuto()
{
	if (!m_pStreamMgr)
		return AK_Fail;

	AKRESULT res = m_pStreamMgr->CreateAuto(
		m_pszFileName,		//文件名
		NULL,				//文件位置解析逻辑，完整路径的话无需
		heuristics,			//自动算法设置
		NULL,				//无缓冲限制
		m_pStream,			//返回的流句柄
		true);				//需要同步打开文件

	return res;
}

AKRESULT StreamAuto::Start()
{
	if (!m_pStream)
		return AK_Fail;

	AKRESULT res = m_pStream->Start();
	return res;
}

AKRESULT StreamAuto::Stop()
{
	if (!m_pStream)
		return AK_Fail;

	AKRESULT res = m_pStream->Stop();
	return res;
}

AKRESULT StreamAuto::GetBuffer(void* out_pBuffer, AkUInt32 out_uSize)
{
	if (!m_pStream)
		return AK_Fail;

	AKRESULT res = m_pStream->GetBuffer(
		out_pBuffer,  //返回数据地址
		out_uSize,	  //返回数据大小
		true		  //阻塞操作
	);

	if (res != AK_DataReady && res != AK_NoMoreData)
	{
		m_bSuccess = false;
		std::cerr << "Read Fail" << std::endl;
		Close();
	}
	else
		return res;
}

AKRESULT StreamAuto::ReleaseBuffer()
{
	if (!m_pStream)
		return AK_Success;

	AKRESULT res = m_pStream->ReleaseBuffer();

	if (res != AK_Success)
	{
		m_bSuccess = false;
		std::cerr << "Release Buffer Fail" << std::endl;
		Close();
	}
	else
		return res;
}

void StreamAuto::CheckDataValidate(AkUInt32 uLoopEnd)
{
	AkStreamInfo streamInfo;
	if (m_pStream)
		m_pStream->GetInfo(streamInfo);
	//文件结尾应该大于loop结尾
	if ((AkUInt32)streamInfo.uSize < uLoopEnd)
	{
		m_bSuccess = false;
		std::cerr << "File Size Small Than Loop Range" << std::endl;
		Close();
		return;
	}
	m_bSuccess = true;
	return;
}

void StreamAuto::Close()
{
	if (m_pStream)
	{
		m_pStream->Destroy;
		return;
	}
	return;
}
```
* 业务函数

```cpp
int main()
{
	//Buffer设置
	const int BUFFER_SIZE = 8192;
	unsigned char* pBuffer = new unsigned char[BUFFER_SIZE];
	//初始指针位置
	AkInt64 ABS_POSITION = 12000;
	//文件名
	const AkOSChar* fileName_read = L"file_read.txt";
	const AkOSChar* fileName_write = L"file_write.txt";

	//---------------------------------------------------------------------------------
	//创建标准流管理类对象
	StreamStd streamStd(fileName_read, BUFFER_SIZE);
	//创建一个标准流
	AKRESULT res = streamStd.CreateStreamStd();

	//流创建成功，执行同步读取操作
	AkUInt32 out_uSize = 0;
	if (res == AK_Success)
	{
		//  同步读取
		AKRESULT res = streamStd.ReadSync(pBuffer, out_uSize);
		//  检查数据有效性
		if (res != AK_Fail)
		{
			streamStd.CheckDataValidate(out_uSize);
		}
	}

	if (streamStd.IsSuccess())
	{
		//使用读取到的数据pBuffer
	}
	//  使用结束关闭流
	streamStd.Close();

	//---------------------------------------------------------------------------------
		//重新创建一个标准流来执行异步读取
	AKRESULT res = streamStd.CreateStreamStd();
	//流创建成功，执行同步读取操作
	AkUInt32 out_uSize = 0;
	if (res == AK_Success)
	{
		//  同步读取
		AKRESULT res = streamStd.ReadAsync(pBuffer, out_uSize);
		//  轮询状态
		AkStmStatus status = streamStd.GetStream()->GetStatus();
		while (status != AK_StmStatusCompleted && status != AK_StmStatusError)
		{
			//执行其它操作
			AKPLATFORM::AkSleep(1);
			status = streamStd.GetStream()->GetStatus();
		}
	}

	if (streamStd.IsSuccess())
	{
		//使用读取到的数据pBuffer
	}
	//  使用结束关闭流
	streamStd.Close();

	//-----------------------------------------------------------------------------------
	//重新创建一个标准流管理类对象来执行写入
	StreamStd streamStd(fileName_write, BUFFER_SIZE);
	//创建标准流
	AKRESULT res = streamStd.CreateStreamStd();
	AkUInt32 out_uSize = 0;
	if (res == AK_Success)
	{
		AKRESULT res = streamStd.Write(pBuffer, out_uSize);
		//  检查数据有效性
		if (res != AK_Fail)
		{
			streamStd.CheckDataValidate(out_uSize);
		}
	}

	//  使用结束关闭流
	streamStd.Close();

	//-------------------------------------------------------------------------------------
	//设置自动流处理的算法设置
	AkAutoStmHeuristics heuristics;
	//吞吐量1M/s
	heuristics.fThroughput = 1048576;
	//假设数据起点在1000偏置量位置
	heuristics.uLoopStart = 1000;
	//假设数据结束点在2000偏置量位置
	heuristics.uLoopEnd = 2000;
	//优先级设定
	heuristics.priority = AK_DEFAULT_PRIORITY;

	//创建自动流管理类对象
	StreamAuto streamAuto(fileName_read, BUFFER_SIZE, heuristics);
	//创建自动流对象
	AKRESULT res = streamAuto.CreateStreamAuto();
	//  启动自动流
	streamAuto.GetStream()->Start();

	//读取第一个buffer
	AkUInt32 out_uSize = 0;
	AKRESULT res = streamAuto.GetBuffer(pBuffer, out_uSize);
	if (res == AK_DataReady || AK_NoMoreData)
	{
		streamAuto.CheckDataValidate(heuristics.uLoopEnd);
	}

	if (streamAuto.IsSuccess())
	{
		//使用buffer数据
	}

	//释放流对象
	streamAuto.ReleaseBuffer();
	//关闭流对象
	streamAuto.Close();

	return 0;
}
```

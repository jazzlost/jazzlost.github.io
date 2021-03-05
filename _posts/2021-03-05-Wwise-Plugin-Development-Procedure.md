---
layout: post
title: "关于Wwise插件开发"
subtitle: "Procedure of Wwise Plugin Development"
author: "李AA"
published: true
header-img: "img/blog-bg-mass.jpg"
tags:
    - C++
    - Wwise
    - Juce
    - Plugin
---


- [前言](#前言)
- [Juce](#juce)
	- [DSP](#dsp)
	- [UI](#ui)
	- [测试](#测试)
- [Wwise](#wwise)
	- [Premake](#premake)
		- [构建工程](#构建工程)
		- [快速测试插件模板](#快速测试插件模板)
		- [调试](#调试)
	- [Authoring Tools Plugin](#authoring-tools-plugin)
		- [结构](#结构)
		- [注册与导出](#注册与导出)
		- [控件](#控件)
		- [接口实现](#接口实现)
		- [测试](#测试-1)
	- [Sound Engine Plugin](#sound-engine-plugin)
		- [结构](#结构-1)
		- [内存管理](#内存管理)
		- [注册](#注册)
		- [接口实现](#接口实现-1)
- [游戏内注册](#游戏内注册)
	- [UE4](#ue4)
	- [Unity](#unity)
- [参考](#参考)



# 前言

* Wwise在提供了Premake构建工具后，插件的开发变得更加简单高效，所以我也有了想简单梳理一遍插件开发流程的想法。本文记录Juce中开发的一个简单效果器插件移植为Windows平台Wwise插件的流程。完整代码可以查看[Github](https://github.com/jazzlost/AkJuceLimiter)

# Juce

* 首先在Juce中快速开发一个简单的```Limiter```效果器，算法参考了[How to build a VST](https://audioordeal.co.uk/how-to-build-a-vst-lesson-4-limiter-1/)

## DSP

* Limiter需要延迟输出所以需要用到```CircularBuffer```结构,index值达到最大后会从头循环，还需要可以设置读写数据，根据delay长度得到下个buffer的index

```cpp
/** CircularBuffer.h */

class CircularBuffer
{
public:
    /** 默认构造 */
	CircularBuffer();
    /** 可以设置最大buffer值与delay长度的构造 */
	CircularBuffer(int bufferSize, int delayLength);
    /** 获取当前readIndex下buffer数据 */
	float getData();
    /** 设置当前writeIndex下buffer数据 */
	void setData(float data);
    /** 计算下一个readIndex和writeIndex */
	void nextSample();

private:
    /** 原始buffer数据 */
	juce::AudioSampleBuffer buffer;
    /** 写入数据下标 */
	int writeIndex;
	/** 读取数据下标 */
    int readIndex;
    /** 读写数据的延迟长度 */
	int delayLength;
};
```
```cpp
/** CircularBuffer.cpp */

/** 根据延迟长度更新readIndex与writeIndex */
void CircularBuffer::nextSample()
{
	int bufferLength = buffer.getNumSamples();
	readIndex = ((bufferLength + writeIndex) - delayLength) % bufferLength;
	writeIndex = (writeIndex + 1) % bufferLength;
}
```

* 然后进行信号处理

```cpp
/** PluginProcessor.cpp */

void LimitAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
	float coeff;

	for (int i = 0; i < buffer.getNumSamples(); i++)
	{
		for (int channel = 0; channel < getMainBusNumOutputChannels(); channel++)
		{
			/** 取当前声道buffer */
			auto* data = buffer.getWritePointer(channel);
			/** 取当前声道CircularBuffer */
			CircularBuffer* delayBuffer = &allBuffers.getReference(channel);
			/** 取当前sample */
			float sample = data[i];
			
			float amplitude = abs(sample);
			/** sample响度大于上一个peak值，系数取attack */
			if (amplitude > xPeak)
			{
				coeff = attackTime;
			}
			/** sample响度小于上一个peak值，系数取release */
			else
			{
				coeff = releaseTime;
			}
			/** 计算当前peak值 */
			xPeak = (1 - coeff) * xPeak + coeff * amplitude;
			/** 计算threshold与Peak的系数 */
			float filter = fmin(1.0f, limiterThresh / xPeak);

			if (gain > filter)
			{
				coeff = attackTime;
			}
			else
			{
				coeff = releaseTime;
			}
			/** 计算增益值 */
			gain = (1 - coeff) * gain + coeff * filter;
			/** 当前sample被处理后的值 */
			float limitedSample = gain * delayBuffer->getData();
			/** 设置writeIndex的buffer值 */
			delayBuffer->setData(sample);
			/** 更新readIndex与writeIndex */
			delayBuffer->nextSample();
			/** 写回buffer */
			data[i] = limitedSample;
		}
	}
}
```

## UI

* UI上添加三个分别控制```threshold/attack/release```的控件

```cpp

/** PluginEditor.h */
juce::Slider thresholdSlider, attackSlider, releaseSlider;

/** PluginEditor.cpp */

/** threshold控件 */
addAndMakeVisible(thresholdSlider);
threshold.setValue(0);
threshold.setRange(-60.f, 10.f, 0.001);
threshold.onValueChange = [this] 
{
	audioProcessor.limiterThresh = std::pow(10, (threshold.getValue() / 20));
};
/** attack控件 */
addAndMakeVisible(attackSlider);
at.setRange(0.f, 10.f, 0.001);
at.onValueChange = [this]
{
	audioProcessor.attackTime = 1 - std::pow(juce::MathConstants<float>::euler, ((1 /audioProcessor.getSampleRate()) * -2.2f) / attackSlider.getValue());
};
/** release控件 */
addAndMakeVisible(releaseSlider);
rt.setRange(0.f, 10.f, 0.001);
rt.onValueChange = [this]
{
	audioProcessor.releaseTime = 1 - std::pow(juce::MathConstants<float>::euler, ((1 /audioProcessor.getSampleRate()) * -2.2f) / releaseSlider.getValue());
};

```

## 测试

* Juce中可以用一个```播放器插件```搭配```PluginHost```进行快速测试

![](WwisePluginDev/Juce/TestPlugin.png)

* 

![](WwisePluginDev/Juce/PluginHostPath.png)

* 播放器插件推荐这个 [AudioFilePlayerPlugin](https://github.com/jonathonracz/AudioFilePlayerPlugin)

# Wwise

## Premake

### 构建工程
* Wwise提供的Premake工具及构建脚本在```%WWISEROOT%/Scripts/Build/Plugins```目录下，在新工程目录下控台运行脚本启动构建生成```插件框架```

```python
python "%WWISEROOT%/Scripts/Build/Plugins/wp.py" new
```

* 选择```插件类型```

![](WwisePluginDev/Premake/BuildType.png)

* 添加插件```创建描述```

![](WwisePluginDev/Premake/Description.png)

* 生成文件

![](WwisePluginDev/Premake/BasicGeneration.png)

* 在之前的目录下运行下面```Premake```命令来生成目标平台(这个工程生成VC160)

```python
python "%WWISEROOT%/Scripts/Build/Plugins/wp.py" premake Windows_vc160
```

* 选择```构建目标```

![](WwisePluginDev/Premake/BuildPlatform.png)

* 构建```目标平台```

![](WwisePluginDev/Premake/Win_vc160TargetGenerated.png)

* 生成vc160项目

![](WwisePluginDev/Premake/VC160_Solution.png)


### 快速测试插件模板

* 构建premake生成的模板工程，如果出现下面报错需要安装```MFC依赖```

![](WwisePluginDev/Premake/BuildAuthoringError.png)

![](WwisePluginDev/Premake/MFC.png)

* 模板工程同时生成AuthoringTools使用dll与Engine使用的lib文件，可以在工程中重新设置输出目录

![](WwisePluginDev/Premake/AuthoringDLL.png)

![](WwisePluginDev/Premake/EngineLib.png)

* Wwise工程中插入该插件以便后面进行测试

![](WwisePluginDev/Premake/AuthoringFX.png)

* 用下面代码快速测试插件构建流程是否正常，插入的声音对象应该被```静音```
```cpp
/** JuceLimit.cpp */

void JuceLimitFX::Execute(AkAudioBuffer* io_pBuffer)
{
    const AkUInt32 uNumChannels = io_pBuffer->NumChannels();

    AkUInt16 uFramesProcessed;
    for (AkUInt32 i = 0; i < uNumChannels; ++i)
    {
        AkReal32* AK_RESTRICT pBuf = (AkReal32* AK_RESTRICT)io_pBuffer->GetChannel(i);

        uFramesProcessed = 0;
        while (uFramesProcessed < io_pBuffer->uValidFrames)
        {
            /** 把所有sample置零 */
            pBuf[uFramesProcessed] = 0.f;
            ++uFramesProcessed;
        }
    }
}
```

* AuthoringTools中改变默认控件```dummy```参数值，下面接口单步调试查看传入的```in_pParams```是否正确
```cpp
/** JuceLimit.cpp */

AKRESULT JuceLimitFX::Init(AK::IAkPluginMemAlloc* in_pAllocator, AK::IAkEffectPluginContext* in_pContext, AK::IAkPluginParam* in_pParams, AkAudioFormat& in_rFormat)
{
	m_pParams = (JuceLimitFXParams*)in_pParams;
	m_pAllocator = in_pAllocator;
	m_pContext = in_pContext;

	return AK_Success;
}
```

### 调试
* Wwise插件的调试我是使用```附加到进程```的方式，打开Wwise工程后VS端附加到进程上进行调试。这里要注意插件Debug版本构建配置的输出目录要设置到"Authoring\x64\Release\bin\Plugins"。AuthoringTools的插件加载目录是这个，或者手动复制过去也可以。
    ![](WwisePluginDev/Wwise/SoundEngine/Debug.png)

* 注意重新构建插件的时候```需要关闭AuthoringTools```, 不然无法更新插件。

## Authoring Tools Plugin

### 结构
* AuthoringTools插件部分基础结构是```控件对象```,```界面数据对象```和```导出函数```三个部分。控件对象由一个xml文件来描述，里面可以设置详细的交互属性。界面数据对象负责控件数据的修改保存等操作。导出函数负责插件实例的创建与注册以及dll的接口导出。

![](WwisePluginDev/Wwise/Authoring/Sources.png)

### 注册与导出
* ```dll```在AuthoringTools中的注册可以通过```RegisterWwisePlugin```,这个可以写在插件实例化的时候.这个注册不包含插件在声音引擎中的注册

```cpp
/** JuceLimit.cpp */

/** 这个是MFC创建程序窗口的入口函数，创建窗体后可以进行插件 */
BOOL JuceLimitApp::InitInstance()
{
    CWinApp::InitInstance();
    AK::Wwise::RegisterWwisePlugin();
    return TRUE;
}
```
* 对于效果器插件，需要有两个导出符号，一个用来```创建插件实例```，一个用来声明```插件列表```

```cpp
/** JuceLimit.cpp */

/** 创建插件效果器实例的接口 */
AK::Wwise::IPluginBase* __stdcall AkCreatePlugin(unsigned short in_companyID, unsigned short in_pluginID)
{
    if (in_companyID == JuceLimitConfig::CompanyID && in_pluginID == JuceLimitConfig::PluginID)
        return new JuceLimitPlugin;

    return nullptr;
}
```

```cpp
/** JuceLimit.cpp */

/** 声明导出插件注册列表 */
DEFINE_PLUGIN_REGISTER_HOOK

/** 定义 */
#define DEFINE_PLUGIN_REGISTER_HOOK AK_DLLEXPORT AK::PluginRegistration * g_pAKPluginList = NULL;
```

* 最后还需要在库描述文件```.def```中指定导出对象
```
/** 导出库文件 */
LIBRARY "JuceLimit"
/** 导出符号 */
EXPORTS
  AkCreatePlugin
```

### 控件

* 控件及属性在```xml```文件中进行描述，具体可以参考[Wwise插件XML描述文件](https://www.audiokinetic.com/zh/library/edge/?source=SDK&id=plugin_xml.html)

```xml
<PluginModule>
  <EffectPlugin Name="JuceLimit" CompanyID="64" PluginID="0">
    <PluginInfo>
      <PlatformSupport>
        <Platform Name="Any">
          <CanBeInsertOnBusses>true</CanBeInsertOnBusses>
          <CanBeInsertOnAudioObjects>true</CanBeInsertOnAudioObjects>
          <CanBeRendered>true</CanBeRendered>
        </Platform>
      </PlatformSupport>
    </PluginInfo>
    <Properties>
      <!-- Add your property definitions here -->
      <Property Name="Threshold" Type="Real32" SupportRTPCType="Exclusive" DisplayName="Threshold">
        <UserInterface Step="0.02" Fine="0.001" Decimals="1" UIMax="1" />
        <DefaultValue>1.0</DefaultValue>
        <AudioEnginePropertyID>0</AudioEnginePropertyID>
        <Restrictions>
          <ValueRestriction>
            <Range Type="Real32">
              <Min>0.001</Min>
              <Max>1.0</Max>
            </Range>
          </ValueRestriction>
        </Restrictions>
      </Property>
		<Property Name="Attack" Type="Real32" SupportRTPCType="Exclusive" DisplayName="Attack">
			<UserInterface Step="0.001" Fine="0.001" Decimals="1" UIMax="1" />
			<DefaultValue>0.001</DefaultValue>
			<AudioEnginePropertyID>1</AudioEnginePropertyID>
			<Restrictions>
				<ValueRestriction>
					<Range Type="Real32">
						<Min>0.001</Min>
						<Max>1.0</Max>
					</Range>
				</ValueRestriction>
			</Restrictions>
		</Property>
		<Property Name="Release" Type="Real32" SupportRTPCType="Exclusive" DisplayName="Release">
			<UserInterface Step="0.001" Fine="0.001" Decimals="1" UIMax="1" />
			<DefaultValue>0.2</DefaultValue>
			<AudioEnginePropertyID>2</AudioEnginePropertyID>
			<Restrictions>
				<ValueRestriction>
					<Range Type="Real32">
						<Min>0.001</Min>
						<Max>1.0</Max>
					</Range>
				</ValueRestriction>
			</Restrictions>
		</Property>
    </Properties>
  </EffectPlugin>
</PluginModule>
```

![](WwisePluginDev/Wwise/Authoring/Panel.png)


### 接口实现

![](WwisePluginDev/Wwise/Authoring/IAudioPlugin.png)

* 界面数据对象需要实现的接口

```cpp
    /** 构造 */
    JuceLimitPlugin();
    /** 析构 */
    ~JuceLimitPlugin();
    /** 对象回收 */
    void Destroy() override;
    /** Wwise设置PropertySet的回调 */
    void SetPluginPropertySet(AK::Wwise::IPluginPropertySet* in_pPSet) override;
    /** Wwise将界面数据写入bank时的回调 */
    bool GetBankParameters(const GUID& in_guidPlatform, AK::Wwise::IWriteData* in_pDataWriter) const override;
```

* 为所有自定义参数做写出操作
```cpp
/** JuceLimitPlugin.cpp */

bool JuceLimitPlugin::GetBankParameters(const GUID& in_guidPlatform, AK::Wwise::IWriteData* in_pDataWriter) const
{
    // Write bank data here
    CComVariant varProp;
    /** threshold写出 */
    m_pPSet->GetValue(in_guidPlatform, L"Threshold", varProp);
    in_pDataWriter->WriteReal32(varProp.fltVal);
    /** attack写出 */
	m_pPSet->GetValue(in_guidPlatform, L"Attack", varProp);
	in_pDataWriter->WriteReal32(varProp.fltVal);
    /** release写出 */
	m_pPSet->GetValue(in_guidPlatform, L"Release", varProp);
	in_pDataWriter->WriteReal32(varProp.fltVal);

    return true;
}
```

### 测试

* 对于插件测试，Wwise给出了完整的```测试单元列表```，可以按具体需求进行测试。[插件测试单元项](https://www.audiokinetic.com/zh/library/edge/?source=SDK&id=plugin_tests.html)

## Sound Engine Plugin

### 结构
* SoundEngine插件部分基础结构是```插件对象```和```参数对象```。插件对象负责插件的创建/注册/卸载/销毁/DSP等功能。参数对象负责维护当前插件的参数与状态。插件对象从其关联参数对象中获取实时参数和状态来更新DSP。参数对象命名规则为```插件名+ Params```后缀。

![](WwisePluginDev/Wwise/SoundEngine/Sources.png)

### 内存管理
* Wwise中定义了几个用于```动态内存管理```的宏，需要确保使用这几个宏来创建和销毁对象，这样才能在内存池中正确获取内存，在Profile里正确显示内存使用情况。

```cpp
/** IAkPluginMemAlloc.h */

/** 创建IAkPlugin对象 */
#define AK_PLUGIN_NEW(_allocator,_what)	new(_allocator) _what

/** 销毁IAkPlugin对象 */
template <class T>
AkForceInline void AK_PLUGIN_DELETE( AK::IAkPluginMemAlloc * in_pAllocator, T * in_pObject )      
{
	if ( in_pObject )
	{
		in_pObject->~T();
		in_pAllocator->Free( in_pObject );
	}
}

/** Wwise提供的Melloc接口 */
#define AK_PLUGIN_ALLOC(_allocator,_size) (_allocator)->Malloc((_size))

/** Wwise提供的Free接口 */
#define AK_PLUGIN_FREE(_allocator,_pvmem) (_allocator)->Free((_pvmem))
```

### 注册
* 首先要提供对象创建函数注册给```PluginManager```来管理
```cpp
AK::IAkPlugin* CreateJuceLimitFX(AK::IAkPluginMemAlloc* in_pAllocator)
{
    return AK_PLUGIN_NEW(in_pAllocator, JuceLimitFX());
}

AK::IAkPluginParam* CreateJuceLimitFXParams(AK::IAkPluginMemAlloc* in_pAllocator)
{
    return AK_PLUGIN_NEW(in_pAllocator, JuceLimitFXParams());
}
```

* 插件ID与创建函数的注册宏
```cpp
AK_IMPLEMENT_PLUGIN_FACTORY(JuceLimitFX, AkPluginTypeEffect, JuceLimitConfig::CompanyID, JuceLimitConfig::PluginID)
```

* 宏定义里面可以看到，```两个创建回调函数的签名不要修改```，然后会实例化一个AK::PluginRegistration来进行注册
```cpp
#define AK_IMPLEMENT_PLUGIN_FACTORY(_pluginName_, _plugintype_, _companyid_, _pluginid_) \
	AK::IAkPlugin* Create##_pluginName_(AK::IAkPluginMemAlloc * in_pAllocator); \
	AK::IAkPluginParam * Create##_pluginName_##Params(AK::IAkPluginMemAlloc * in_pAllocator); \
	AK::PluginRegistration _pluginName_##Registration(_plugintype_, _companyid_, _pluginid_, Create##_pluginName_, Create##_pluginName_##Params);
```

* 除了两个对象创建函数回调外，还可以传入```自定义回调函数```，进行一些状态与数据有效性的检查或者更新。
```cpp

/** 回调函数签名 */
typedef void( * AkGlobalCallbackFunc) (AK::IAkGlobalPluginContext *in_pContext, AkGlobalCallbackLocation in_eLocation, void *in_pCookie)

/** 自定义回调 */
static void JuceLimitGlobalCalolback(AK::IAkGlobalPluginContext *in_pContext, AkGlobalCallbackLocation in_eLocation, void *in_pCookie)
{
    if(in_eLocation == AkGlobalCallbackLocation_Init)
    {
        /** 声音引擎初始化时回调 */
    }
    else if(in_eLocation == AkGlobalCallbackLocation_Begin)
    {
        /** 音频处理开始时回调 */
    }
    else if(in_eLocation == AkGlobalCallbackLocation_End)
    {
        /** 音频处理结束时回调 */
    }
}

```

### 接口实现

* IAkPlugin类视图

![](WwisePluginDev/Wwise/SoundEngine/IAkPlugin.png)

* 插件对象需要实现的接口(本文创建类是IAkInPlaceEffectPlugin)

```cpp
    /** 构造 */
    JuceLimitFX();
    /** 析构 */
    ~JuceLimitFX();
    /** 初始化 */
    AKR ESULT Init(AK::IAkPluginMemAlloc* in_pAllocator, AK::IAkEffectPluginContext* in_pContext, AK::IAkPluginParam* in_pParams, AkAudioFormat& in_rFormat);
    /** 卸载 */
    AKRESULT Term(AK::IAkPluginMemAlloc* in_pAllocator);
    /** 重置 */
    AKRESULT Reset();
    /** 插件信息Getter */
    AKRESULT GetPluginInfo(AkPluginInfo& out_rPluginInfo);
    /** 信号处理 */
    void Execute(AkAudioBuffer* io_pBuffer);
    /** 特定帧处理 */
    AKRESULT TimeSkip(AkUInt32 in_uFrames);
```

* Juce的DSP代码只需要通过一个```转接层```就可以最小化修改的放到Wwise的DSP代码中。这个例子中只需要实现一个```juce::AudioBuffer<float>```类到```AkAudioBuffer```类的转接类AkJuceAudioBuffer就可以了

```cpp
/** AkJuceAudioBuffer.h */

/** 把所有DSP用到的接口用AkAudioBuffer的方法实现一下 */
class AkJuceAudioBuffer : public AkAudioBuffer
{
public:

	AkJuceAudioBuffer();
	AkJuceAudioBuffer(int numChannelsToAllocate, int numSamplesToAllocate, AK::IAkPluginMemAlloc* in_pAllocator);
	
	~AkJuceAudioBuffer();

	AkSampleType getSample(int channel, int sampleIndex);
	
	void setSample(int destChannel, int sampleIndex, float newValue);
	
	int getNumSamples();

	AkSampleType* getWritePointer(int channel);

	void clear();
};
```

* DSP部分把Buffer类改为```AkJuceAudioBuffer```基本就无需其它修改了, init的时候获取更新的效果器参数

```cpp
/** JuceLimitFX.cpp */

AKRESULT JuceLimitFX::Init(AK::IAkPluginMemAlloc* in_pAllocator, AK::IAkEffectPluginContext* in_pContext, AK::IAkPluginParam* in_pParams, AkAudioFormat& in_rFormat)
{
	m_pParams = (JuceLimitFXParams*)in_pParams;
	m_pAllocator = in_pAllocator;
	m_pContext = in_pContext;

    /** 获取最新效果器参数 */
	limiterThresh = m_pParams->RTPC.fThreshold;
	attackTime = m_pParams->RTPC.fAttack;
	releaseTime = m_pParams->RTPC.fRelease;
	
	gain = 1.0f;
	xPeak = 0.f;

	/** 为每个声道创建一个CircularBuffer */
	for (int i = 0; i < in_rFormat.GetNumChannels(); i++)
	{
		allBuffers.push_back(new CircularBuffer(10, 1, in_pAllocator));
	}

	return AK_Success;
}

void JuceLimitFX::Execute(AkAudioBuffer* io_pBuffer)
{
    /** 替换buffer类 */
	AkJuceAudioBuffer* buffer = static_cast<AkJuceAudioBuffer*>(io_pBuffer);
	const AkUInt32 uNumChannels = buffer->NumChannels();

	AkUInt16 uFramesProcessed;
	float coeff;
	for (AkUInt32 i = 0; i < uNumChannels; ++i)
	{
        /** 获取指定声道数据块 */
		AkReal32* AK_RESTRICT pBuf = (AkReal32 * AK_RESTRICT)io_pBuffer->GetChannel(i);
		uFramesProcessed = 0;
		coeff = 0.f;
		while (uFramesProcessed < buffer->uValidFrames)
		{
			/** 取当前声道CircularBuffer */
			CircularBuffer* delayBuffer = allBuffers[i];
			/** 取当前sample */
			float sample = pBuf[uFramesProcessed];

			float amplitude = abs(sample);
			/** sample响度大于上一个peak值，系数取attack */
			if (amplitude > xPeak)
			{
				coeff = attackTime;
			}
			/** sample响度小于上一个peak值，系数取release */
			else
			{
				coeff = releaseTime;
			}
			/** 计算当前peak值 */
			xPeak = (1 - coeff) * xPeak + coeff * amplitude;
			/** 计算threshold与Peak的系数 */
			float filter = fmin(1.0f, limiterThresh / xPeak);

			if (gain > filter)
			{
				coeff = attackTime;
			}
			else
			{
				coeff = releaseTime;
			}
			/** 计算增益值 */
			gain = (1 - coeff) * gain + coeff * filter;
			/** 当前sample被处理后的值 */
			float limitedSample = gain * delayBuffer->getData();
			/** 设置writeIndex的buffer值 */
			delayBuffer->setData(sample);
			/** 更新readIndex与writeIndex */
			delayBuffer->nextSample();
			/** 写回buffer */
			pBuf[uFramesProcessed] = limitedSample;
			++uFramesProcessed;
		}
	}
}
```

* IAkParam类视图

![](WwisePluginDev/Wwise/SoundEngine/IAkPluginParam.png)

* 参数对象需要实现的接口

```cpp
    /** 构造 */
    JuceLimitFXParams();
    /** 拷贝构造 */
    JuceLimitFXParams(const JuceLimitFXParams& in_rParams);
    /** 析构 */
    ~JuceLimitFXParams();
    /** 拷贝 */
    IAkPluginParam* Clone(AK::IAkPluginMemAlloc* in_pAllocator);
    /** 初始化 */
    AKRESULT Init(AK::IAkPluginMemAlloc* in_pAllocator, const void* in_pParamsBlock, AkUInt32 in_ulBlockSize);
    /** 卸载 */
    AKRESULT Term(AK::IAkPluginMemAlloc* in_pAllocator);
    /** 参数设置 */
    AKRESULT SetParamsBlock(const void* in_pParamsBlock, AkUInt32 in_ulBlockSize);
    AKRESULT SetParam(AkPluginParamID in_paramID, const void* in_pValue, AkUInt32 in_ulParamSize);
```

* 修改自定义参数结构和参数ID(参数ID在xml文件中设置过)

```cpp
/** 效果器参数ID，需要与xml文件中ID属性设置一致 */
static const AkPluginParamID PARAM_THRESHOLD_ID = 0;
static const AkPluginParamID PARAM_ATTACK_ID = 1;
static const AkPluginParamID PARAM_RELEASE_ID = 2;
/** 自定义效果器参数结构 */
struct JuceLimitRTPCParams
{
    AkReal32 fThreshold;
	AkReal32 fAttack;
	AkReal32 fRelease;
};
```

* 修改初始化时默认效果器参数

```cpp
AKRESULT JuceLimitFXParams::Init(AK::IAkPluginMemAlloc* in_pAllocator, const void* in_pParamsBlock, AkUInt32 in_ulBlockSize)
{
    if (in_ulBlockSize == 0)
    {
        /** 默认效果器参数 */
        RTPC.fThreshold = 1.0f;
		RTPC.fAttack = 0.001f;
		RTPC.fRelease = 0.2f;
        m_paramChangeHandler.SetAllParamChanges();
        return AK_Success;
    }

    return SetParamsBlock(in_pParamsBlock, in_ulBlockSize);
}
```

* 需要修改从bank获取数据的两个接口

```cpp

/** 设置效果器所有参数 */
AKRESULT JuceLimitFXParams::SetParamsBlock(const void* in_pParamsBlock, AkUInt32 in_ulBlockSize)
{
    AKRESULT eResult = AK_Success;
    AkUInt8* pParamsBlock = (AkUInt8*)in_pParamsBlock;

    /** 读取bank数据 */
    RTPC.fThreshold = READBANKDATA(AkReal32, pParamsBlock, in_ulBlockSize);
	RTPC.fAttack = READBANKDATA(AkReal32, pParamsBlock, in_ulBlockSize);
	RTPC.fRelease = READBANKDATA(AkReal32, pParamsBlock, in_ulBlockSize);

    CHECKBANKDATASIZE(in_ulBlockSize, eResult);
    /** 更新所有效果器参数 */
    m_paramChangeHandler.SetAllParamChanges();

    return eResult;
}

/** 设置效果器单个参数 */
AKRESULT JuceLimitFXParams::SetParam(AkPluginParamID in_paramID, const void* in_pValue, AkUInt32 in_ulParamSize)
{
    AKRESULT eResult = AK_Success;

    /** 读取并更新单个效果器参数 */
    switch (in_paramID)
    {
    case PARAM_THRESHOLD_ID:
        RTPC.fThreshold = *((AkReal32*)in_pValue);
        m_paramChangeHandler.SetParamChange(PARAM_THRESHOLD_ID);
        break;
    case PARAM_ATTACK_ID:
		RTPC.fAttack = *((AkReal32*)in_pValue);
		m_paramChangeHandler.SetParamChange(PARAM_ATTACK_ID);
		break;
	case PARAM_RELEASE_ID:
		RTPC.fAttack = *((AkReal32*)in_pValue);
		m_paramChangeHandler.SetParamChange(PARAM_RELEASE_ID);
		break;
    default:
        eResult = AK_InvalidParameter;
        break;
    }

    return eResult;
}
```

# 游戏内注册

## UE4

* 创建出厂头文件```JuceLimitFXFactory.h```,并放置到```%WWISEROOT%\Wwise 2019.2.9.7459\SDK\include\AK\Plugin```目录下

```cpp
/** JuceLimitFXFactory */
AK_STATIC_LINK_PLUGIN(JuceLimitFX);
```

* ```AkAudio.Build.cs```中增加lib加载信息

```cpp
/** AkAudio.Build.cs */
AddWwiseLib(Target, "JuceLimitFX");
```

* ```AkAudioDevice.h```中增加之前创建的出厂头文件

```cpp
#include <AK/Plugin/JuceLimitFX.h>
```

## Unity

* 将动态库放置到```\Assets\Wwise\Deployment\Plugins\%Platform%\%Arch%\DSP```目录下即可

* 对于特殊需要静态加载的平台, 手动创建静态加载文件
```cpp
namespace AK { class PluginRegistration; };

#define AK_STATIC_LINK_PLUGIN(_pluginName_)  extern AK::PluginRegistration _pluginName_##Registration; void *_pluginName_##_fp = (void*)&_pluginName_##Registration;

 
#include "JuceLimitFXFactory.h"

AK_STATIC_LINK_PLUGIN(JuceLimitFX)
```

# 参考

[1]Alex Rycroft.How to build a VST – Lesson 4: Limiter

[2]WwiseSDK2019.2.9.创建新插件

[3]Joel Robichard.简化 Wwise 音频插件构建管线
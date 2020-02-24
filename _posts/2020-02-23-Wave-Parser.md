---
layout: post
title: "关于Wave格式"
subtitle: "Study Of Wave Formate"
author: "李AA"
published: true
header-img: "img/blog-bg-nightsky.jpg"
tags:
    - Audio
    - Wave
---

* TOC
{:toc}

# 前言
* Wave文件应该是音频领域使用最广泛的容器格式了.对于Wave文件的解析器(Parser),也是构建音频引擎的重要组件.本文受[数字音频规范与程序设计](https://book.douban.com/subject/11540677/)与[Waveless](https://github.com/zhangdoa/Waveless)项目启发,意在搭建一个简单parser模型来更好的理解Wave文件格式.


# 一些Wave格式标准
  * Wave格式是属于RIFF(Resourse Interchange File Format)规范的格式之一.这个规范下的多媒体格式还有.RMI/.RMN/.ANI
  
  * Wave文件支持所有ACM规范下的编码格式,常用的有PCM/ADPCM.
  
  * Wave文件常用采样率为11.025kHz/44.1kHz/48kHz/96kHz.常用采样精度为8bit/16bit/24bit/32bit

  * 8bit采样精度使用```unsigned char```来表示,取值范围```0~255```.16bit采样精度使用```signed short```来表示,取值范围```-32768 ~ 32767```.24bit/32bit通常采用浮点类型来表示,也可以使用```signed int```来表示,取值范围```−8388608 ~ 8388607```.

  * PCM编码(非ADPCM压缩编码)的wav文件大小 = ```采样率(sample rate) * 采样精度(bit depth) * 声道数 * 时长/8```


# 文件结构
  * wave文件由基础```Chunk```和```SubChunk```组成，下图是基础Chunk。包含了基本文件信息和采样点数据。

  ![](/img/in-post/WaveParser/format.GIF)

  * 根据8~12字节的format信息可以将文件类型分为三种

  ![](/img/in-post/WaveParser/formatCode.GIF)

  1. ```PCM Formate``` (WAVE_FORMAT_PCM)
     * 标准的PCM文件类型

  2. ```Non-PCM Formats``` (WAVE_FORMAT_IEEE_FLOAT / WAVE_FORMAT_ALAW / WAVE_FORMAT_MULAW)
      * 浮点编码或者压缩编码的PCM类型
      
  3. ```Extensible Format``` (WAVE_FORMAT_EXTENSIBLE)
      * fmt chunk中有其他sub-chunk时的类型


# Chunk数据
* Wave格式的元数据是通过各类Chunk数据块组合而成,不同类型Chunk块储存不同的种类元数据,Chunk也是元数据组合的最小单位.

  * ## RIFF Chunk
  ```cpp
    struct RIFFChunk
    {
      //RIFF规范标识符 : "RIFF"
      char ckID[4];
      //RIFF Chunk 大小
      unsigned long ckSize;
      //Wave格式ID: "WAVE"
      char WavID[4];
    };
  ```
  * ## Standard Format Chunk

  ```cpp
  struct StandardPCMFmtChunk
  {
    //Chunk ID: "fmt"
    char ckID[4];
    //fmt Chunk 大小
    unsigned long ckSize;
    //音频数据的编码格式
    unsigned short wFormatTag;
    //声道数
    unsigned short nChannels;
    //采样率
    unsigned long nSamplesPerSec;
    //每秒码率
    unsigned long nAvgBytesPerSec;
    //对齐占位数据 2=16-bit mono, 4=16-bit stereo
    unsigned short nBlockAlign;
    //采样精度
    unsigned short wBitsPerSample;
  };
  ```
  * ## Non-PCM Format Chunk
  ```cpp
  struct NonPcmFmtChunk
  {
    //与Standard Format Chunk相同
    StandardPCMFmtChunk standardFmtChunk;
	  //extension Chunk的大小
	  unsigned short cbSize;
  };
  ```
  * ## Extensible Format Chunk
  ```cpp
  struct ExtensibleFmtChunk
  {
    //与Standard Format Chunk相同
	  StandardPCMFmtChunk standardFmtChunk;
	  //extension Chunk的大小
	  unsigned short cbSize;
	  //实际有效的编码位,比如12bit的编码方式采样精度显示的是16bit,实际有效编码位只有12bit
	  unsigned short wValidBitsPerSample;
	  //回放音响的布局
	  unsigned long dwChannelMask;
	  //GUID标识符(头两位是subformat信息,剩余12位是GUID标识符)
	  char SubFormat[16];
  };
  ```
  * ## Data Chunk
  ```cpp
  struct DataChunk
  {
	  //Chunk ID: "data"
  	char ckID[4];
	  //实际音频数据大小
	  unsigned long ckSize;
  };
  ```
  * ## Fact Chunk
  ```cpp
  struct FactChunk
  {
	  //Chunk ID: "fact"
	  char ckID[4];
	  //fact Chunk 大小
	  unsigned long ckSize;
	  //每个声道采样数
	  unsigned long dwSampleLength;
  };
  ```
  * ## Bext Chunk
  ```cpp
  struct BextChunk
  {
  	//Chunk ID = "bext"
  	char ckID[4];
    //bext chunk 大小
  	unsigned long ckSize;
    //文件描述信息
  	char Description[256];
    //创作者信息
  	char Originator[32];
    //创作者关联信息
  	char OriginatorReference[32];
    //创作日期
  	char OriginationDate[10];
    //创作时间 <<hh::mm::ss>>
  	char OriginationTime[8];
  	//对齐占位数据
  	unsigned short Align = 0;
    //参考时间 低位
  	unsigned long TimeReferenceLow;
    //参考时间 高位
  	unsigned long TimeReferenceHigh;
    //BWF版本号
  	unsigned short Version;
    //SMPTE UMID数据
  	char UMID[64];
    //集成响度值 LUFS
  	short LoudnessValue;
    //响度范围值 LU
  	short LoudnessRange;
    //TruePeak峰值 dBTP
  	short MaxTruePeakLevel;
    //瞬时响度均值 LUFS
  	short MaxMomentaryLoudness;
    //ShortTerm响度均值 LUFS
  	short MaxShortTermLoudness;
    //预留空间 现在全为0
  	char Reserved[180];
  };
  ```
  * ## Junk Chunk
  ```cpp
  struct JunkChunk
  {
  	//Chunk ID = "JUNK"
  	char ckID[4];
    //Junk Chunk 大小
  	unsigned long ckSize;
    //无效数据
  	char initialData[74];
  };
  ```
  * ## RF64 Chunk
  ```cpp
  struct RF64Chunk
  {
  	// Chunk ID = "RF64"
  	char ckID[4]; 
  	// -1 不要使用这个数据,用DS64 Chunk里面的riffSizeHigh 和 riffSizeLow来获取大小
  	unsigned long ckSize;
  	// Type ID = "WAVE"
  	char rf64Type[4]; 
  };
  ```

  * ## DS64 Chunk
  ```cpp
  struct DS64Chunk
  {
  	// Chunk ID = "DS64"
  	char ckID[4];
    //DS64 Chunk大小
  	unsigned long ckSize;
    //RF64 Chunk大小的低四位
  	unsigned long RIFFSizeLow;
    //RF64 Chunk大小的高四位
  	unsigned long RIFFSizeHigh;
    //Data Chunk数据大小的低四位
  	unsigned long DataSizeLow;
    //Data Chunk数据大小的高四位
  	unsigned long DataSizeHigh;
    //fact Chunk采样数大小低四位
  	unsigned long SampleCountLow;
    //fact Chunk采样数大小高四位
  	unsigned long SampleCountHigh;
    //Table数组的大小
  	unsigned long TableLength;
  };
  ```
  * ## PAD Chunk
  ```cpp
  struct PadChunk
  {
    //Chunk ID = "PAD"
  	char ckID[4];
    //Pad Chunk大小
  	unsigned long ckSize;
  };
  ```

  * ## 一些不常用扩展Chunk
  1.  Cue Chunk
  2.  Playlist Chunk
  3.  Associated Data Chunk
  4.  Instrument Chunk
  5.  Sample Chunk

# Header分类
  * ## Standard PCM

  ```cpp
  struct StandardWavHead
  {
  	RIFFChunk RIFFChunk;
  	StandardPCMFmtChunk fmtChunk;
  	DataChunk DataChunk;
  };
  ```

  * ## Non-PCM

  ```cpp
  //基本少有单独是Non-PCM类型的Header,因为Non-PCM Header只是包含了Extensible  Header的基础数据类型
  struct NonPcmHead
  {
  	RIFFChunk RIFFChunk;
  	NonPcmFmtChunk fmtChunk;
  	FactChunk FactChunk;
  	DataChunk DataChunk;
  };
  ```
  * ## Extensible

  ```cpp
  struct ExtensibleWavHead
  {
  	RIFFChunk RIFFChunk;
  	ExtensibleFmtChunk fmtChunk;
  	FactChunk FactChunk;
  	DataChunk DataChunk;
  };

  struct ExtensibleNoFactHead
  {
  	RIFFChunk RIFFChunk;
  	ExtensibleFmtChunk fmtChunk;
  	DataChunk DataChunk;
  };
  ```
  * ## BWF

  ```cpp
  //EBU制定的Wave格式扩展标准,增加了大量的元数据供使用
  struct StandardBWFHead
  {
  	RIFFChunk RIFFChunk;
  	StandardPCMFmtChunk fmtChunk;
  	BextChunk BextChunk;
  	JunkChunk JunkChunk;
  	DataChunk DataChunk;
  };

  struct RF64Header
  {
  	RF64Chunk RF64Chunk;
  	DS64Chunk DS64Chunk;
  	//std::vector<CS64Chunk> TableChunk;
  	ExtensibleFmtChunk fmtChunk;
  	BextChunk BextChunk;
  	//JunkChunk JunkChunk;
  	DataChunk DataChunk;
  };

  struct ExtensibleBWFHead
  {
  	RIFFChunk RIFFChunk;
  	ExtensibleFmtChunk fmtChunk;
  	FactChunk FactChunk;
  	BextChunk BextChunk;
  	JunkChunk JunkChunk;
  	DataChunk DataChunk;
  };
  ```


# Data数据类型

  ```cpp
  enum class WavDataType
  {
  	Invalid,
  	//usigned int8
  	WavData8bit,
  	//int12
  	WavData12bit,
  	//int16
  	WavData16bit,
  	//int24
  	WavData24bit,
  	//float32
  	WavData32bit,
  	//float64
  	WavData64bit
  };
  ```
  ```
  signed-integer
  PCM data stored as signed (‘two’s complement’) integers. Commonly used with a 1or 24 −bit encoding size. A value of 0 represents minimum signal power.
  
  unsigned-integer
  PCM data stored as unsigned integers. Commonly used with an 8-bit encoding size. value of 0 represents maximum signal power.
  
  floating-point
  PCM data stored as IEEE 753 single precision (32-bit) or double precision (64-bitfloating-point (‘real’) numbers. A value of 0 represents minimum signal power.
  
  a-law 
  International telephony standard for logarithmic encoding to 8 bits per sample. Ihas a precision equivalent to roughly 13-bit PCM and is sometimes encoded witreversed bitordering (see the −X option).
  
  u-law, mu-law
  North American telephony standard for logarithmic encoding to 8 bits per sampleA.k.a.µ-law. It has a precision equivalent to roughly 14-bit PCM and is sometimeencoded with reversed bit-ordering (see the −X option).
  
  oki-adpcm
  OKI (a.k.a. VOX, Dialogic, or Intel) 4-bit ADPCM; it has a precision equivalent to
  roughly 12-bit PCM. ADPCM is a form of audio compression that has a goocompromise between audio quality and encoding/decoding speed.

  ima-adpcm
  IMA (a.k.a. DVI) 4-bit ADPCM; it has a precision equivalent to roughly 13-bit PCM.
  
  ms-adpcm
  Microsoft 4-bit ADPCM; it has a precision equivalent to roughly 14-bit PCM.
  
  gsm-full-rate
  GSM is currently used for the vast majority of the world’s digital wirelestelephone calls.It utilises several audio formats with different bit-rates anassociated speech quality.
  ``` 

* ## Data数据的一些标准
  * ### I/O
    Wave采样数据点的取值范围和采样精度相关联.CPU对于数据帧的IO操作是以8位为基础单位的,所以数模转换器产生(ADC)产生的数据也是8的整数倍.
  
  * ### 左对齐(left-justified)
    采样点数据使用左对齐,剩余的比特位在右边用零填充.比如12bit数据```101011101011```补全为```1010111010110000```.

  * ### 小端编码(little endian)
    低比特位在低地址位.内存内布局:
    ```10110000|10101110```.
    
  * ### 采样帧(sample frame)
    * 同时播放的采样点称作采样帧。多声道文件的采样点数据是交替储存的。
    * stereo  [left | right]
    * 3.0 [left | right | center]
    * quad [front left | front right | rear left | rear right] 
    * 4.0  [left | center | right | surround]
    * 5.1 [left center | left | center | right center | right | surround]


# WaveParser

## [GitHub](https://github.com/jazzlost/WavParser)
* ## Parser设计思路
  我准备了22个各种Header类型的测试文件,以正确解析所有文件为标准,只负责Header数据的解析,暂时没有Header信息的编辑以及Data部分的处理.

* ## Parser的使用
  ```cpp
  #include "WavParser.h"
  #include "WavUtility.h"

  int main()
  {
    const std::string& FilePath = "MyFileFolder/MyFile.wav"

    auto MyParser = new WavParser();
    if(MyParser->LoadFile(FilePath))
    {
      MyParser->Parser();
    }

    std::cin.get();
    delete MyParser;
    return 0;
  }
  ```

* ## Parser的测试文件

  ```cpp
  enum class TestFileType
  {
    //WAVE file, stereo unsigned 8-bit data
	  Uint8Stereo,
    //WAVE file, stereo A-law data
	  Uint8ALawStereo,
    //WAVE file, stereo µ-law data
	  UInt8MuLawStereo,
    //WAVE file, stereo 12/16-bit data
	  Int12Stereo,
    //WAVE file, stereo 16-bit data
	  Int16Stereo,
    //WAVE file, stereo 24-bit data
	  Int24Stereo,
    //WAVE file, stereo 32-bit data
	  Int32Stereo,
    //WAVE file, stereo 32-bit float data
	  Float32Stereo,
    //WAVE file, stereo 64-bit float data
	  Float64Stereo,
    //WAVE (WAVE_FORMAT_EXTENSIBLE) file, stereo unsigned 8-bit data
	  Uint8StereoExt,
    //WAVE (WAVE_FORMAT_EXTENSIBLE) file, stereo A-law data
	  UInt8ALawStereoExt,
    //WAVE (WAVE_FORMAT_EXTENSIBLE) file, stereo µ-law data
	  UInt8MuLawStereoExt,
    //WAVE (WAVE_FORMAT_EXTENSIBLE) file, stereo 12/16-bit data
	  Int12StereoExt,
    //WAVE (WAVE_FORMAT_EXTENSIBLE) file, stereo 16-bit data
	  Int16StereoExt,
    //WAVE (WAVE_FORMAT_EXTENSIBLE) file, stereo 24-bit data
	  Int24StereoExt,
    //WAVE (WAVE_FORMAT_EXTENSIBLE) file, stereo 32-bit data
	  Int32StereoExt,
    //WAVE (WAVE_FORMAT_EXTENSIBLE) file, stereo 32-bit float data
	  Float32StereoExt,
    //WAVE (WAVE_FORMAT_EXTENSIBLE) file, stereo 64-bit float data
	  Float64StereoExt,
    //6-channel WAVE file with speaker locations FL FR FC LF BL BR, 44100 Hz, 16-bit
	  Int16Channel_6,
    //8-channel WAVE file with speaker locations FL FR FC LF BL BR - -, 48000 Hz, 24-bit
	  Int24Channel_8,
    //WAVE file, BWF Type, 16-bit data
	  Int16Bwf,
    //WAVE file, RF64 Type, 24-bit Data
	  Int24RF64
  };

  int main()
  {
    const std::string& FilePath = GetTestFilePath(TestFileType::Int16Stereo);

    ......

  }
  ```
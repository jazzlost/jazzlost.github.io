---
layout: post
title: "Unreal中UBT与模块创建"
subtitle: "UBT & Create Modules In Unreal"
author: "李AA"
published: true
header-img: "img/blog-bg-balloon.jpg"
tags:
    - Unreal
---

* TOC
{:toc}

# 前言
* UBT作为Unreal工具链的核心基础工具，出现在开发的各方面。作为Unreal的构建工具，对于引擎的反射系统，C++代码与蓝图的融合，序列化，服务器端的复制，GC等模块的创建都是必不可少的。想要很好的理解UBT需要大量的学习研究，本文重在了解与使用层面对UBT做讨论。

# 基本概念
* ## UBT
  * UBT其实就是Unreal自己的构建工具，一个用cpp编写的命令行工具。与MakeFiles和MSbuild类似，为了流程化多平台代码的编译而产生。构建工具都需要进行: 构建定义, [构建解析](https://imzlp.me/posts/6362/)，构建执行这三个步骤。UBT也不例外。我们可以配置的构建定义在模块的build.cs与target.cs文件中。

* ## Modules
    * 模块是Unreal的基础概念，通过模块切分不同功能的源代码，同时定义一些公共接口供其它模块使用，最后会被编译为exe或者dll(启动模块编译为exe，非启动模块编译为dll，或者lib静态链接到exe)。模块的编译信息在```Build.cs```中设置

* ## Target
    * Target是UBT的生成对象信息，里面定义了5类生成对象，对应不同的优化级别以及需要编译的源码信息，项目的编译信息```Target.cs```中设置。

# UE构建路径
1. [点击GenerateProjectFiles.bat生成UnrealBuildTools](#generateprojectfilesbat)
2. GenerateProjectFiles向UBT中传入工程构建参数生成工程
3. [进入工程中点击Build调用build.bat,其中调用UBT](#buildbat)
4. [UBT执行所有模块target.cs与build.cs中的逻辑](#buildcs)
5. UBT调用UHT根据宏标记生成代码
6. [UHT结束工作后UBT调用编译器](#%e7%94%9f%e6%88%90%e5%b7%a5%e7%a8%8b)
7. 预处理/编译/链接

## GenerateProjectFiles.bat

* 当我们Clone了源代码之后，安装完一些依赖库之后，就会运行GenerateProjectFiles.bat
* 之前的批处理会调用Engine\Build\BatchFiles\GenerateProjectFiles.bat并将参数一并传入。

```shell
@echo off

if not exist "%~dp0Engine\Build\BatchFiles\GenerateProjectFiles.bat" goto Error_BatchFileInWrongLocation
call "%~dp0Engine\Build\BatchFiles\GenerateProjectFiles.bat" %*
exit /B %ERRORLEVEL%

```
* 这个批处理文件中会确定几个构建依赖程序是否存在，同时调用GetMSBuildPath.bat确定MSBuild.exe的位置信息。

```shell
if not exist "%~dp0..\..\Source" goto Error_BatchFileInWrongLocation

pushd "%~dp0..\..\Source"
if not exist ..\Build\BatchFiles\GenerateProjectFiles.bat goto Error_BatchFileInWrongLocation

if not exist ..\Binaries\DotNET\RPCUtility.exe goto Error_MissingBinaryPrerequisites

call "%~dp0GetMSBuildPath.bat"
if errorlevel 1 goto Error_NoVisualStudioEnvironment

if not exist "%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" goto NoVsWhere

set MSBUILD_15_EXE=
for /f "delims=" %%i in ('"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere" -latest -products * -requires Microsoft.Component.MSBuild -property installationPath') do (
	if exist "%%i\MSBuild\15.0\Bin\MSBuild.exe" (
		set MSBUILD_15_EXE="%%i\MSBuild\15.0\Bin\MSBuild.exe"
		goto FoundMsBuild15
	)
)

```

* 然后通过MSBuild传入UnrealBuildTool.csproj来构造UnrealBuildTool，生成路径在E:\XGame\toaa_engine\Engine\Binaries\DotNET\UnrealBuildTool.exe

```shell
%MSBUILD_EXE% /nologo /verbosity:quiet Programs\UnrealBuildTool\UnrealBuildTool.csproj /property:Configuration=Development /property:Platform=AnyCPU /target:Clean

```

## build.bat

* 打开一个Solution，右键项目打开的Properties属性，可以看到NMake的构建命令使用的是Engine\Build\BatchFiles目录下的三个bat文件，分别执行生成/重新生成/清理命令。

```shell
@echo off
setlocal enabledelayedexpansion

REM The %~dp0 specifier resolves to the path to the directory where this .bat is located in.
REM We use this so that regardless of where the .bat file was executed from, we can change to
REM directory relative to where we know the .bat is stored.
pushd "%~dp0\..\..\Source"

REM %1 is the game name
REM %2 is the platform name
REM %3 is the configuration name

IF EXIST ..\..\Engine\Binaries\DotNET\UnrealBuildTool.exe (
        ..\..\Engine\Binaries\DotNET\UnrealBuildTool.exe %* -DEPLOY
		popd

		REM Ignore exit codes of 2 ("ECompilationResult.UpToDate") from UBT; it's not a failure.
		if "!ERRORLEVEL!"=="2" (
			EXIT /B 0
		)
		 
		EXIT /B !ERRORLEVEL!
) ELSE (
	ECHO UnrealBuildTool.exe not found in ..\..\Engine\Binaries\DotNET\UnrealBuildTool.exe 
	popd
	EXIT /B 999
)
```

## 生成工程

* 生成UBT后再把需要生成的工程和之前批处理的参数一并传递给UnrealBuildTool.exe来生成VS工程。UBT需要列四组参数来构建项目
  * %1 Game Name
  * %2 Platform Name
  * %3 Configuration Name
  * %4 Project Path

```shell
UnrealBuildTool.exe BlankProject Win64 Development "C:\Users\Documents\Unreal Projects\BlankProject\BlankProject.uproject" -WaitMutex -FromMsBuild
```
* Configuration类型

```cpp
//包含Engine和Game的Debug Symbols,没有编译优化,适合Engine和Game的全局Debug,编译速度最慢
Debug
//Engine的编译有优化,Game没有优化,适合Game Modules的Debug
DebugGame
//Engine和Game模块除了一些性能热点模块,其它都进行了编译优化.UnrealEditor的默认编译模式,适合Game开使用.
Development
//性能最优化设置,还剔除了控台,stats,profiling工具,适合版本发行.
Shipping
//Shipping模式但是开启了控台,stats和Profiling工具.
Test
``` 

## build.cs
* 每个Module或者Plugin都有一个build.cs信息，作为提供给UBT的环境依赖信息描述。

```c#
using UnrealBuildTool;

public class MyModule : ModuleRules
{
    public MyModule(ReadOnlyTargetRules Target) : base(Target)
    {
        //Core对于其它所有模块是基本模块
        PublicDependencyModuleNames.AddRange(new string[]{"Core"});
        PrivateDependencyModuleNames.AddRange(new string[]);
        PublicIncludePaths.AddRange(new string[]);

        ...
    }
}
``` 

* 常用模块变量

```cpp
//Public和Private目录依赖的外部模块列表,需要链接
PublicDependencyModuleNames
//Private目录依赖,Public目录没有依赖的外部模块列表,需要链接
PublicDependencyModuleNames
//Public目录依赖的外部模块列表,无需链接(动态链接)
PrivateIncludePathModuleNames
//Private目录依赖的外部模块列表,无需链接(动态链接)
PrivateIncludePathModuleNames
//本模块的内部头文件，不暴露给其他模块(Public目录默认是暴露给其它模块的，可以用此隐藏，或者用于模块内部子模块间头文件的包含，简化头文件路径)
PrivateIncludePaths
//Public目录下需要暴露给其它模块的头文件,UBT默认将Public目录暴露,这里添加了相对路径之后，其它模块只需直接包含头文件名就行了，简化头文件路径
PublicIncludePaths
//系统/第三方库路径(lib文件)
PublicLibraryPaths
//动态链接库路径(dll文件)
DynamicallyLoadedModuleNames
//预编译头设置
PCHUseage
```

## Target.cs
* BuildTarget有五类,每类Target都定义了最终Build时需要编译的源文件以及模块组合.比如一个Editor对象Build后对应一个exe以及一些dll文件.

```c#
using UnrealBuildTool;
public class MyTarget : TargetRules
{
    public MyTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game
        ...
    }
}
```
* Target类型

```cpp
//包含Client与Server代码,不包含Editor代码,生成独立游戏程序
Game
//包含Game/Client/Server代码,如果需要再UnrealEditor中打开工程并进行修改则需要构建Editor Target
Editor
//只包含客户端代码,专用于使用UE4的networking feature的Multiplayer Games联机模式.
Client
//只包含服务器代码,专用于使用UE4的networking feature的Multiplayer Games联机模式.
Server
//独立程序代码
Program
```

# 自定义模块创建

1. Source文件夹下创建插件文件夹MyModule

2. 文件夹内创建Private/Public文件夹与MyModule.Build.cs文件，Private里创建MyModulea.cpp，Publi里创建MyModule.h

    ![](/img/in-post/UBT/MyModuleFiles.png)

    ```cpp
    //MyModule.h
    #pragma once
    #include "CoreMinimal.h"
    ```

    ```cpp
    //MyModule.cpp
    #include "MyModule.h"
    #include "Modules/ModuleManager.h"
    //如果模块内没有Gameplay代码，则用IMPLEMENT_MODULE宏
    IMPLEMENT_GAME_MODULE(FDefaultGameModuleImpl, MyModule, "MyModule");
    ```
3. MyModule.Build.cs中添加依赖模块以及外部可读取的文件

    ```c#
    //MyModule.Build.cs
    using UnrealBuildTool;
    public class MyModule : ModuleRules
    {
        public MyModule(ReadOnlyTargetRules Target) : base(Target)
        {
            PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

            PublicDependencyModuleNames.AddRange(new string[] {"Core", "CoreUObject", "Engine"  "InputCore" });

            PrivateDependencyModuleNames.AddRange(new string[] { });

        }
    }
    ```
4. uproject文件中添加模块的项目设置

    ```shell
    {
    	"FileVersion": 3,
    	"EngineAssociation": "4.21",
    	"Category": "",
    	"Description": "",
    	"Modules": [
    		{
    			"Name": "CustomModule",
    			"Type": "Runtime",
    			"LoadingPhase": "Default"
    		},
    		{
    			"Name": "MyModule",
    			"Type": "Runtime",
    			"LoadingPhase": "Default",
    			"AdditionalDependencies": [
    				"Engine"
    			]
    		}
    	]
    }
    ```

5. 项目的.Target.cs与Editor.Target.cs文件中加上模块名字

    ```c#
    //.Target.cs
    using UnrealBuildTool;
    using System.Collections.Generic;
    public class CustomModuleTarget : TargetRules
    {
    	public CustomModuleTarget(TargetInfo Target) : base(Target)
    	{
    		Type = TargetType.Game;
    		ExtraModuleNames.AddRange( new string[] { "CustomModule" } )    ;
    		ExtraModuleNames.AddRange( new string[] { "MyModule" } );
        }
    }
    ```

6. 重新生成工程，可以看到模块已经加载，模块也被编译为独立dll

![](/img/in-post/UBT/MyModule.png)

![](/img/in-post/UBT/MyModuleDll.png)


7. 可以通过Class Manager创建类在模块中，也可以手动创建

    ![](/img/in-post/UBT/MyModuleActor.png)

    * 手动创建要记得添加 模块名_API的宏 供UBT把此类Build进相应模块dll中

    ```cpp
    UCLASS()
    class MYMODULE_API AMyModuleActor : public AActor
    {
    	GENERATED_BODY()
    
    public:	
    	// Sets default values for this actor's properties
    	AMyModuleActor();

    };
    ```

# 参考

[Unreal Engine 4 build file demystified - DmitryYanovsky](http://dmitry-yanovsky.com/2015/08/unreal-engine-4-build-file-demystified/)

[Build flow of the Unreal Engine4 project - Z's Blog](https://imzlp.me/posts/6362/)

[理解UnrealBuildTool - 罗传月武](https://www.zhihu.com/search?type=content&q=unreal%20build)

[Target Configurations - Unreal Docs](https://docs.unrealengine.com/en-US/Programming/BuildTools/UnrealBuildTool/TargetFiles/index.html)

[Build Configuration - Unreal Docs](https://docs.unrealengine.com/en-US/Programming/Development/BuildConfigurations/index.html)


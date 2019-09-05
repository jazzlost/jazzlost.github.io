---
layout: post
title: "声音事件代理的管理"
subtitle: "Manager System of Delegate"
author: "李AA"
published: true
header-img: "img/blog-bg-rope.jpg"
tags:
    - Unreal
---

# 前言
* 实际项目开发中，需求快速迭代。音频作为独立的一个部分，降低声音设计师和游戏程序之间的耦合性，是很重要的一部分。很多时候我们完成了声音功能的开发，直接把功能接口暴露给游戏程序调用，在音频端和程序端都不灵活。我在想有没有一套比较好的代理系统，可以较快捷的进行接口绑定和管理，同时程序端也可以快速调用代理，这就是本文探讨重点。

# 流程描述
* ## 音频开发端
    * [代理类型创建](#delegatebase)
    * [代理管理器(Delegate Manager)注册代理类型](#delegatemanager%e4%bb%a3%e7%90%86%e7%ae%a1%e7%90%86%e5%99%a8)
    * [声音接口绑定(C++/BP)](#%e7%bb%91%e5%ae%9a)
    * [维护事件池(Event Pool)](#event-pool)

* ## GamePlay开发端
  * [直接调用事件池中的事件(Event Pool)](#%e7%a8%8b%e5%ba%8f%e8%b0%83%e7%94%a8)

# DelegateBase
* ```DelegateBase```类中声明了3个最常用类型的代理。```AudioDelegate```绑定单个无参数函数接口。```AudioMultiDelegate```绑定多个无参数函数接口。```AudioBPDelegate```用于绑定蓝图实现的函数接口。

```cpp
//代理声明
DECLARE_DELEGATE(AudioDelegate)
DECLARE_MULTICAST_DELEGATE(AudioMultiDelegate)
DECLARE_DYNAMIC_MULTICAST_DELEGATE(AudioBPDelegate)

class DelegateBase
{
public:
    virtual ~DelegateBase() {}

    virtual AudioDelegate &GetDelegate() const
    {
        return m_Delegate;
    }

    virtual AudioMultiDelegate &GetMultiDelegate() const
    {
        return m_MultiDelegate;
    }

    virtual AudioBPDelegate &GetBPDelegate() const
    {
        return m_BPDelegate;
    }

    //子类DelegateOnHit新添加接口
    virtual AudioDelegateOneParam &GetAudioDelegateOneParam() const{}
    //子类DelegateOnAttack新添加接口
    virtual AudioDelegateOneParam &GetAudioMultiDelegateOneParam() const {}

protected:
    AudioDelegate m_Delegate;
    AudioMultiDelegate m_MultiDelegate;

    UPROPERTY(BlueprintAssignable)
    AudioBPDelegate m_BPDelegate;
};
```
* 对于不同的事件，创建不同的代理类型，可以选择是否继承```DelegateBase```
  
```cpp
//新代理类型声明
DECLARE_DELEGATE_OneParam(AudioDelegateOneParam, FString);
//受击时声音代理类型
class DelegateOnHit : public DelegateBase
{
public:
    //override有需求的代理类型
    virtual AudioDelegate &GetDelegate() const override
    {
        return m_Delegate;
    }

    virtual AudioBPDelegate &GetBPDelegate() const override
    {
        return m_BPDelegate;
    }
    //添加新的代理类型成员变量的Get函数，并且需要回DelegateBase类中添加相同签名虚函数接口
    virtual AudioDelegateOneParam &GetAudioDelegateOneParam() const override
    {
        return m_DelegateOneParam;
    }

private:
    AudioDelegateOneParam m_DelegateOneParam;
};

//-----------------------------------------------------------------------------
DECLARE_MULTICAST_DELEGATE_OneParam(AudioMultiDelegateOneParam, int32)
//攻击时声音代理类型
class DelegateOnAttack : public DelegateBase
{
    //override有需求的代理类型
    virtual AudioDelegate &GetDelegate() const override
    {
        return m_Delegate;
    }

    //添加新的代理类型成员变量的Get函数，并且需要回DelegateBase类中添加相同签名虚函数接口
    virtual AudioDelegateOneParam &GetAudioMultiDelegateOneParam() const override
    {
        return m_MultiDelegateOneParam;
    }
private:
    AudioMultiDelegateOneParam m_MultiDelegateOneParam;
};
```
# DelegateManager(代理管理器)
* ```DelegateManager```这个类的作用主要是，维护管理已经实例化且完成绑定的代理对象。之后可以通过名字直接查找代理类对象。

```cpp
class DelegateManager
{
public:
    static DelegateManager& Get()
    {
        static DelegateManager managerSingleton;
        return managerSingleton;
    }

    //Add已经完成绑定的代理对象到管理列表
    bool AddDelegate(const FString& name, DelegateManager *delegate)
    {   
        if(name.empty())
            return false;
        if(m_DelegateMap.find(name) == nullptr)
        {
            auto pair = std::make_pair(name, TSharedPtr<DelegateBase>(delegate));
            m_DelegateMap.insert(pair);
            return true;
        }
        else
            return false;
    }
    
    //Get管理列表中的代理对象
    TSharedPtr<DelegateBase> GetDelegate(const FString &name)
    {
        if(name.empty())
            return nullptr;
        
        if(auto iter = m_DelegateMap.find(name))
        {
            return iter->second;
        }
        else
            return nullptr;
    }

    //Remove管理列表中的代理对象
    bool RemoveDelegate(const FString &name)
    {
        if(name.empty())
            return false;

        if(m_DelegateMap.find(name))
        {
            m_DelegateMap.erase(name);
            return true;
        }
        else
            return false;
    }

    //修改管理列表中的代理名称和代理对象的映射
    bool ResetDelegate(const FString &name, DelegateBase *delegate);
    {
        if(name.empty() || delegate == nullptr)
            return false;

        if(auto iter = m_DelegateMap.find(name))
        {
            iter->second = TSharedPtr<DelegateBase>(delegate);
            return true;
        }
        else
            false;
    }

protected:
    //为每个代理类创建一个对象并且加入管理列表,只在第一次Get时调用
    static void Initialize();

private:
    //管理列表
    static std::map<FString, TSharedPtr<DelegateBase>> m_DelegateMap;

    //单例对象
    static DelegateManager& managerSingleton;
    static bool IsInitialized;

    //单例
    DelegateManager(){}
    ~DelegateManager(){}
};

//单例Get函数
DelegateManager& DelegateManager::Get()
{
    static DelegateManager managerSingleton;
    
    if(!IsInitialized)
        DelegateManager::Initialize();
    
    return managerSingleton;
}

DelegateManager& DelegateManager::managerSingleton = DelegateManager::Get()；
bool DelegateManager::IsInitialized = false;

void DelegateManager::Initialize()
{
    if(m_DelegateMap.find(FString("DelegateOnHit")))
        return;
    auto pair1 = std::make_pair(FString("DelegateOnHit"), TSharedPtr<DelegateBase>(new DelegateOnHit()));
    if()
    auto res1 = m_DelegateMap.insert(pair1);
    if(m_DelegateMap.find(FString("DelegateOnAttack")))
        return;
    auto pair2 = std::make_pair(FString("DelegateOnAttack"), TSharedPtr<DelegateBase>(new DelegateOnAttack());
    auto res2 = m_DelegateMap.insert(pair2);

    IsInitialized = true;

}
```

# 绑定
* 在需要绑定的函数接口类中Get ```DelegateManager```单例并绑定接口

```cpp
class CharacterSound
{
public:
    //游戏开始时执行的函数
    virtual void BeginPlay() override
    {
        //在游戏开始时或者其他时刻进行声音接口绑定
        DelegateManager::Get().GetDelegate(FString("DelegateOnHit"))->BindUObject(this, &CharacterSound::PlayOnHitSound);
        DelegateManager::Get().GetDelegate(FString("DelegateOnAttack"))->AddUObject(this,CharacterSound::PlayOnAttackSound);
        //绑定完成后添加到
    }

    PlayOnHitSound()
    {
        //播放声音代码
    }

    PlayOnAttackSound(int32 distance)
    {
        //播放声音代码
    }
} 
```

# Event Pool
* 事件池中对```DelegateManager```中对象进行接口端的业务处理

```cpp
namespace EventPool;
{
    void OnHit()
    {
        if(auto delegate = DelegateManager::Get().GetDelegate(FString("DelegateOnHit")))
            delegate->GetDelegate().ExecuteIfBound();
        else
            return;
    }

    void OnAttack(int32 distance)
    {
        if(auto delegate = DelegateManager::Get().GetDelegate(FString("DelegateOnAttack")))
            delegate->GetDelegate().Boardcast(distance);
        else
            return;
    }
}
```

# 程序调用

```cpp
int main()
{
    EventPool::OnHit();
    EventPool::OnAttack(500);
}
```

# 总结
* 整个代理管理流程还是初步设计阶段，现在对于绑定和调用都比较友好。```DelegateManager```的维护成本较高，后续继续改进。通过这套系统可以管理大量的代理对象，以及维护代理间的映射关系，以上实现部分基于Unreal。
---
layout: post
title: "Unreal基于对象的语音系统"
subtitle: "Dialogue System In Unreal"
author: "李AA"
published: true
header-img: "img/blog-bg-city.jpg"
tags:
    - Unreal
---

* TOC
{:toc}

# 前言
* Dialogue Voice System是Unreal的音频系统中为数不多的亮点。这个工具在实际使用流程中比较流畅，组合性也很强大，虽然有一定维护成本，但是值得借鉴分析。

* ## 设计思路
1. Single Listener

![](/img/in-post/DialogueSystem/SingleListener.GIF)

* 演示视频
<iframe src="//player.bilibili.com/player.html?aid=64717647&cid=112350932&page=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" width="640" height="480"> </iframe>

1. Multi Listeners

![](/img/in-post/DialogueSystem/MultiListeners.GIF)

* 演示视频
<iframe src="//player.bilibili.com/player.html?aid=64717721&cid=112351265&page=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" width="640" height="480"> </iframe>

* ## 可组合效果
1. ```单个玩家和单个NPC每次对话的不同```
2. ```单个玩家和多个NPC每次对话的不同```
3. ```单个玩家不同状态和同一个NPC对话不同```
4. ```多个玩家和同一NPC对话不同```
5. ```多个玩家不同状态和同一NPC对话不同```

* ## 使用步骤

1. 为```listener```和```emitter```创建```Dialogue Voice```（对话个体）组件，在组件中设置标签

    ![](/img/in-post/DialogueSystem/DialogueVoice.GIF)
    ![](/img/in-post/DialogueSystem/DialogueObject.GIF)

2. 为一个对话场景创建一个```Dialogue Wave```组件(对话逻辑组)，组件中设置```Dialogue Voice```之间的关系以及具体播放声音对象

    ![](/img/in-post/DialogueSystem/DialogueWave.GIF)

3. 可以创建一个```Dialogue Wave```和具体对话场景关联的容器类来管理每个```Dialogue Wave```(对话逻辑组)和具体场景(scene)的关系

    ![](/img/in-post/DialogueSystem/DataTable.GIF)

4. 最后设置播放逻辑

    ![](/img/in-post/DialogueSystem/BP.GIF)

# 系统
##  Dialogue Voice
* Dialogue Voice相当于对话对象组件，用来标识相同的一类对话对象，便于在Dialogue Wave中进行逻辑设置

* 语音系统的Voice组件默认提供了两个标签```Gender```和```Plurality```。标签应该可以扩展，以便更加精细的对对话对象进行分类

* 同一个人物对象可以有多个对话对象组件，用来表示不同状态，不同时刻人物对话内容的差异。

![](/img/in-post/DialogueSystem/DialogueVoice.GIF)

## Dialogue Wave
* Dialogue Wave相当于对话逻辑组。用来组合多个Dialogue Voice和具体的声音素材，同时可以进行本地化语言的设置

* 对话逻辑组设计之前应该对所有对话素材按scene进行整理分类，对于每个scene尽量用一个对话逻辑组来表示。同一个人物对象可以关联多个不同的对话逻辑组，对应不同的对话对象和对话场景。

![](/img/in-post/DialogueSystem/DialogueWave.GIF)

# 接口
* 下面用代码快速原型一下这个系统，以下是我自己对系统的理解，不是Unreal源代码

```cpp
#include <string>
#include <vector>
#include <map>

//------------------------------DialogueVoice用到的Tag------------------------------------------------------
enum Gender
{
    Neuter,
    Masculine,
    Feminine,
    Mixed
};

enum Plurality
{
    Singular,
    Plural
};

//----------------------------简略SoundCue类，可以播放音频文件------------------------------------------------
class SoundCue
{
public:
    void Play() {}

private:
    const std::string m_SoundPath;
};

//------------------------------Dialogue Voice类，可以设置标签------------------------------------------------
class DialogueVoice
{
public:
    DialogueVoice() : m_Gender(Neuter), m_Plurality(Singular) {}

    ~DialogueVoice() {}

    void SetGender(const Gender type)
    {
        m_Gender = type;
        return;
    }

    const Gender &GetGender() const
    {
        return m_Gender;
    }

    void SetPlurality(const Plurality plurality)
    {
        m_Plurality = plurality;
        return;
    }

    const Plurality &GetPlurality() const
    {
        return m_Plurality;
    }

private:
    Gender m_Gender;
    Plurality m_Plurality;
};

//-----------------------------------Dialogue Wave类的基本数据结构-------------------------------------
struct DialogueContexts
{
    DialogueContexts() : listeners(1) {}

    DialogueVoice *speaker = nullptr;

    std::vector<DialogueVoice *> listeners;

    SoundCue *sound = nullptr;
};

//-----------------------------------Dialogue Wave类，维护对话逻辑组-------------------------------------
class DialogueWave
{
public:
    DialogueWave() : m_Contexts(1) {}

    ~DialogueWave()
    {
        if (m_Contexts.size() > 0)
        {
            for (auto context : m_Contexts)
            {
                if (context->listeners.size() > 0)
                {
                    for (auto listener : context->listeners)
                    {
                        delete listener;
                        listener = nullptr;
                    }
                }
                delete context;
                context = nullptr;
            }
        }
    }

    int AddDialogueContext()
    {
        DialogueContexts *newContext = new DialogueContexts();
        m_Contexts.push_back(newContext);
        return m_Contexts.size() - 1;
    }

    void DeleteDialogueContext(int contextIndex)
    {
        if (m_Contexts.size() >= 1 && contextIndex < m_Contexts.size())
        {
            m_Contexts.erase(m_Contexts.begin() + contextIndex - 1);
            return;
        }
        else
            return;
    }

    void SetSpeaker(int contextIndex, DialogueVoice *speaker)
    {
        if (contextIndex < m_Contexts.size())
        {
            if (speaker)
                m_Contexts[contextIndex]->speaker = speaker;
            else
                return;
        }
        else
            return;
    }

    int AddListener(int contextIndex)
    {
        if (contextIndex < m_Contexts.size())
        {
            DialogueVoice *newListener = new DialogueVoice();
            m_Contexts[contextIndex]->listeners.push_back(newListener);
            return m_Contexts[contextIndex]->listeners.size() - 1;
        }
        else
            return -1;
    }

    void SetListeners(int contextIndex, int voiceIndex, DialogueVoice *dialogueVoice)
    {
        if (contextIndex < m_Contexts.size())
        {
            if (voiceIndex < m_Contexts[contextIndex]->listeners.size() && dialogueVoice)
            {
                m_Contexts[contextIndex]->listeners[voiceIndex] = dialogueVoice;
                return;
            }
            else
                return;
        }
        else
            return;
    }

    void DeleteListener(int contextIndex)
    {
        if (contextIndex < m_Contexts.size())
        {
            if (!m_Contexts[contextIndex]->listeners.empty())
            {
                m_Contexts[contextIndex]->listeners.pop_back();
                return;
            }
        }
        else
            return;
    }

    void SetSound(int contextIndex, SoundCue *soundCue)
    {
        if (contextIndex < m_Contexts.size())
        {
            if (soundCue)
            {
                m_Contexts[contextIndex]->sound = soundCue;
                return;
            }
            else
                return;
        }
        else
            return;
    }

    void ClearSound(int contextIndex)
    {
        if (contextIndex < m_Contexts.size())
        {
            if (m_Contexts[contextIndex]->sound)
            {
                m_Contexts[contextIndex]->sound = nullptr;
            }
            else
                return;
        }
        else
            return;
    }

    const std::vector<DialogueContexts *> &GetContexts() const
    {
        return m_Contexts;
    }

private:
    std::vector<DialogueContexts *> m_Contexts;
};

//-----------------------------可选类，管理DialogueWave和具体场景scene关联-----------------------------------------
class DialogueManager
{
public:
    int AddDialogueScene(const std::string &sceneName, DialogueWave *dialogueWave)
    {
        if (!sceneName.empty() && dialogueWave)
        {
            std::pair<const std::string &, DialogueWave *> newPair(sceneName, dialogueWave);
            DialogueSceneMap.insert(newPair);
        }
        else
            return -1;
    }

private:
    std::map<const std::string &, DialogueWave *> DialogueSceneMap;
};

//-------------------------------游戏角色类，可以拥有多个Dialogue Voice---------------------------------------------
class Actor
{
public:
    const std::vector<DialogueVoice *> &GetAllDialogueVoiceComponent() const
    {
        return m_DialogueVoice;
    }

private:
    std::vector<DialogueVoice *> m_DialogueVoice;
};

//------------------------最终的全局play函数，在提供的Dialogue Wave中寻找是否有涉及Actor的Dialogue Voice--------------
//  如果有的话，播放对应的SoundCue
void PlayDialogueAtLocation(Actor *actor, const DialogueWave *dialogueWave)
{
    if (actor && dialogueWave)
    {
        auto dialogueVoices = actor->GetAllDialogueVoiceComponent();
        for (auto dialogueVoice : dialogueVoices)
        {
            auto contexts = dialogueWave->GetContexts();
            for (auto context : contexts)
            {
                for (auto listener : context->listeners)
                {
                    if (listener == dialogueVoice)
                    {
                        context->sound->Play();
                    }
                }
            }
        }
    }
    else
        return;
}
```

# 结语
* 快速原型了一遍dialogue系统后更加觉得Unreal这个设计的简洁实用，无论对于开发端还是用户端都比较友好，也有良好的扩展性，可以借鉴思路移植到其他游戏开发平台。
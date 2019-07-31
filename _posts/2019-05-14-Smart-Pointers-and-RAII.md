---
layout: post
title: "Smart Pointers与RAII技术"
subtitle: "Use RAII To Manager Resource"
author: "李AA"
header-img: "img/blog-bg-sea.jpg"
tags:
    - C++
---

* TOC
{:toc}

* # 前言
  * Effective C++中有一章专门用来总结资源管理，可以看出资源管理操作在C++中的坑之多。有坑就有不被坑的方法，所以有了做一篇简略总结的想法。

  * 这里对于资源的定义是从系统获取，使用完后需要还给系统的东西。最常见的便是heap-based memory。还有句柄资源，mutex locks，数据库连接等。这些东西的共同点便是如果使用后不释放，会导致系统资源量的减少，而且伴随很难定位到的系统不明占用问题。

  * 对于资源类，获取和释放方法一般都需要成对使用，但是真正资源管理的情况会比较复杂。异常，资源的多次释放，代码维护的改动，以及大量的获取释放调用都会在不经意间造成bug。智能指针以及RAII(Resource Acquisition Is Initalization)技术便是改进管理的方法。

* # 智能指针
  * ## auto_ptr
  1. auto_ptr的特点是在析构函数调用的时候会释放其中raw_pointer所指的资源
    ```cpp
        //一个获取资源的类
        class Resource()
        {
        public:
            static Resource* getResource();
        }

        static Resource* getResource()
        {
            return new Resource();
        }


        //需要使用到资源的方法
        void foo()
        {
            //获取资源并使用auto_ptr管理
            std::auto_ptr<Resource> pSource(Resource::getResource())

            //使用资源
            ...

        }//函数结束时会调用pSource析构函数，同时释放资源
    ```
    1. 为了防止多个auto_ptr指向同一资源，导致被释放多次，auto_ptr的特性是当调用拷贝构造函数或者赋值运算符复制它时，被复制的auto_ptr会变成nullptr，以保证只有一个auto_ptr只想同一个资源。
    ```cpp
        //一个获取资源的类
        class Resource()
        {
        public:
            static Resource* getResource();
        };

        static Resource* getResource()
        {
            return new Resource();
        }

        //需要使用到资源的方法
        void foo()
        {
            //获取资源并使用auto_ptr管理
            std::auto_ptr<Resource> pSource_01(Resource::getResource());

            //现在pSource_01指向nullptr,pSource_02指向原资源
            std::auto_ptr<Resource> pSource_02(pSource_01);

        }//函数结束时会调用pSource_02析构函数，同时释放资源
    ```

  * ## shared_ptr
    1. shared_ptr增加了引用计数，每次有新的shared_ptr指向同一个资源时计数会增加，当计数为0时自动释放资源。
    ```cpp
        //一个获取资源的类
        class Resource()
        {
        public:
            static Resource* getResource();
        }

        static Resource* getResource()
        {
            return new Resource();
        }

        //需要使用到资源的方法
        void foo()
        {
            //获取资源并交给shared_ptr管理,引用计数为1
            std::shared_ptr<Resource> pSource_01(Resource::getResource());

            //使用资源
            ...
            //引用计数增加为2，两个指针指向同一份资源
            std::shared_ptr<Resource> pSource_02(pSource_01);

            //引用计数变为3
            pSource_03 = pSource_02;

            //引用计数变为0，资源自动释放
            pSource_01.reset();
            pSource_02.reset();
            pSource_03.reset();
        }
    ```
    2. 注意auto_ptr和shared_ptr在其析构函数中所执行的是delete，而不是delete[]。所以对于数组类资源的管理完全可以通过string，vector等容器类来替代。容器提供了自动的容量扩展和内存管理。

   
  * ## unique_ptr
    1. unique_ptr和auto_ptr的区别在于不允许拷贝构造和赋值，也就是不允许复制。
    ```cpp
        //一个获取资源的类
        class Resource()
        {
        public:
            static Resource* getResource();
        };

        static Resource* getResource()
        {
            return new Resource();
        }

        //需要使用到资源的方法
        void foo()
        {
            //获取资源并使用auto_ptr管理
            std::unique_ptr<Resource> pSource_01(Resource::getResource());

            //错误
            std::auto_ptr<Resource> pSource_02(pSource_01);
            pSource_02 = pSource_01

        }//函数结束时会调用pSource_01析构函数，同时释放资源
    ```
      
* # RAII
  * RAII技术的核心是获取完资源就马上交给资源管理类。前文所述三种类便是比较常用的RAII工具。如果需要自己设计资源管理类，则下面几个方面需要注意：
  
    * ### 对于拷贝的限制
      * Q: 为什么要禁止拷贝？
      * A: 对于一些资源的RAII类，复制行为本身是不合理的，像是系统mutex类如果进行了copy将增加管理的风险，和大量重复资源的占用。
    ```cpp
        //可以将复制构造函数和复制运算符声明为private,则无法调用复制
        class NoCopyResource
        {
        private:
            NoCopyResource(const NoCopyResource& rhs);
            NoCopyResource& operator=(const NoCopyResource& rhs);
        };

        //也可以创建Uncopyable基类
        class Uncopyable
        {
        protected:
            Uncopyable() {};
            ~Uncopyable() {};
        private:
            Uncopyable(const Uncopyable& rhs);
            Uncopyable& operator=(const Uncopyable& rhs);
        };
        //因为子类拷贝构造函数被调用的时候会先调用其父类拷贝构造函数，所以不能被拷贝
        class NoCopyResource : public Uncopyable
        {
            ...
        };
    ```
    * ### 深度拷贝, 复制底层资源
      * Q: 拷贝RAII合理吗？
      * A: 只要是你需要，且逻辑上合理都可以进行资源的复制。这个时候选择复制其RAII类，是为了确保不需要这个资源的副本时可以被RAII正确释放。
      <br> <br/>
      * Q: 什么情况需要深度拷贝
      * A: 对象中存在需要RAII类管理的资源时，基本都需要深度拷贝。因为浅拷贝会造成两个对象中都有指向同一个资源的指针，如果其中一个析构时释放了资源，另一个变成为了野指针。
    ```cpp
        //这里用一个自定义string类做例子，资源类流程都类似
        //资源类
        class String
        {
        public: 
            //RAII类通过这个接口获取原始资源
            static String* MakeString(char* str)
            {
                m_str = new char(strlen(str) + 1);
                ...
            } 

            ~String()
            {
                if(m_str)
                {
                    delete [] m_str;
                    m_str = nullptr;
                }
            }
        private:
            //无法通过构造函数来直接获取资源
            String(char* str) (){};
            static char* m_str;
        };
        //管理类
        class StringManager
        {
        public:
            String* GetString(char* str)
            {
                //RAII
                m_res = String::MakeString(str);
                return m_res;
            }

            ~StringManager()
            {
                //析构的时候因为m_res的存在会调用String类的析构函数
            }

            StringManager(const StringManager& rhs)
            {
                m_res = new char(strlen(rhs.m_res)+1);
                strcpy(m_res, rhs.m_res);
            }

            StringManager& operator=(const StringManager& rhs)
            {
                //防止自我拷贝
                if(m_res = rhs.m_res)
                    return *this;
                else
                {
                    delete[] m_res;
                    m_res = new char(strlen(rhs.m_res)+1);
                    strcpy(m_res, rhs.m_res);
                }
                return *this;
            }

        private:
            String* m_res;
        };

        void foo()
        {
            StringManager copyManager;
            //StringManager作用域，离开便析构释放资源
            {
                StringManager MyStrMgr;
                //进行RAII.p_mychar是其它地方或者系统提供的Raw资源
                auto myStr = MyStrMgr.GetString(p_mychar);
                //进行深度拷贝
                copyManager_01 = MyStrMgr;
                StringManager copyManager_02(MyStrMgr);           
            }
            //离开作用域，MyStrMgr析构，资源myStr被释放,copyManager_02也析构释放资源副本
            //copyManager_01仍然持有原资源副本
        }
        //离开函数域copyManager_01析构释放资源副本
    ```
    * ### 引用计数，deleter
      * Q: 什么是deleter？
      * A: 我们使用shared_ptr等引用计数器时，当引用次数为0时默认行为是删除所指向资源，但是有些时候我们想要的是其他行为，比如mutex类我们想要的行为是unlock当引用计数为0的时候。 这个时候就需要使用deleter。shared_ptr的第二个参数可以指定函数对象为deleter。
    ```cpp
        class StringManager
        {
        public:

            void GetString(char* str)
            {
                //这个用一个clear函数来做deleter,这种情况下都无需显示声明析构函数了
                myStr = shared_ptr<String>(*(String::MakeString(str)), Clear)
            }

            void Clear(){...}

        private:
            std::shared_ptr<String> myStr;
        }
    ```

    * ### 提供原始资源的Raw Pointer
      * Q: 为什么需要提供Raw Pointer
      * A: 虽然使用RAII的目的是隔绝用户和原始资源，但是现代API的设计避免不了通过RAII访问原始资源的需求。可以通过显式转换和隐式转换来提供Raw Pointer。
    ```cpp
        //auto_ptr和shared_ptr都提供了get()方法
        class StringManager
        {
        public:

            void GetString(char* str)
            {
                //这个用一个clear函数来做deleter,这种情况下都无需显示声明析构函数了
                myStr = shared_ptr<String>(*(String::MakeString(str)), Clear)
            }

            void Clear(){...}

            //显示转换
            String& Get()
            {
                if(myStr->use_count > 0)
                    return myStr->get()
            }

            //隐式转换
            operator String() const
            {
                returen myStr->get();
            }

        private:
            std::shared_ptr<String> myStr;
        }

        //假如有这么一个函数
        UseStringDoSomething(String& str);
        //显式调用
        StringManager myStrMgr;
        UseStringDoSomething(myStrMgr.Get());
        //隐式调用
        StringManager myStrMgr;
        UseStringDoSomething(myStrMgr);

        //隐式转换虽然方便用户使用，但是会有很多安全，应该根据实际情况来设计
    ```

    * ### smart pointer构造时使用独立的分离语句
    ```cpp
        //假设这里有个函数需要如下两个函数
        void UseStringDoSomething(String& str, int nums)
        //为了使用RAII,一般进行如下调用
        UseStringDoSomething(GetString(), GetNums());
        //这里可能出现如下问题，调用GetString()时涉及到调用shared_ptr构造和MakeString()两步
        
        //GetNums()和GetString()的调用顺序是不明的，如果GetNums在shared_ptr构造和MakeString()之间调用了，且出现异常中止，那就是不可知结果.
        
        //所以正确做法
        auto str = GetString();
        UseStringDoSomething(str, GetNums());
    ```




      
     
     

      
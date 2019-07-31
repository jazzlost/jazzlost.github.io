---
layout: post
title: "C++中的列表初始化"
subtitle: "Initialization List In C++"
author: "李AA"
header-img: "img/blog-bg-wallpaper.jpg"
tags:
    - C++
---

* TOC
{:toc}


# 前言
* 在对STL学习过程初期会遇到一些类似 ```std::unique_ptr<std::string> pname {new std::string {"Hello"}};``` 这样大括号内嵌的语句。后来知道是C++11开始支持的列表初始化。从对数组的支持扩展到了自定义类，在STL中运用很多。

# 列表初始化
* 在C++98/03中只能用列表对数组和POD(Plain Old Data)进行初始化

```cpp
    //初始化数组
    int arr[] = {1, 2, 3};

    //初始化结构体
    struct SBar
    {
        int x;
        double y;
    } bar = {1, 2.0};

    //对于非静态常量的类成员，需要通过成员初始化列表来初始化
    class CFoo
    {
    public:    
        CFoo(int i, const char* ch) : m_num(i), m_ch(ch){}

    private:
        int m_num;
        const char* m_ch
    };

    int main()
    {
        //通过构造函数初始化
        CFoo foo(1, "hello"); 

        return 0;
    }
```

* C++11中的列表初始化的适用场景更友好了

```cpp
    class CFoo
    {
    public:    
        CFoo(int i, const char* ch);

    private:
        int m_num;
        const char* m_ch
    };

    int main()
    {
        //等价的初始化语法
        CFoo foo_01 = {1, "hello"};
        CFpp foo_02 {1, "hello"};

        int n_i = {1};
        int n_j {1};

        //对于new操作符也适用
        int* p_i = new int{1};
        int* p_j = new int[]{1,2,3};

        //STL中初始化系统类型和自定义类型
        std::vector<int> v_i {1,2,3,4};
        std::map<int, const char*> m_i { {1, "a"}, {2, "b"}, {3, "c"} };
        std::shared_ptr<CFoo> p_Foo {new CFoo{1, "hello"}};
    }
```

* 不适用于列表初始化的场景
  * 类内有用户自定义构造函数
  
```cpp
    struct SBar
    {
        int i;
        SBar(int i){std::cout << "Initialized" << i << std::endl;}
    };

    int main()
    {
        SBar bar{1};
        //输出只有“Initialized”,列表初始化被自定义构造函数隐藏,这种情况编译器不会报错要小心
    }
```

  * 类内包含protected或者private的非静态成员变量

```cpp
    struct SBar
    {
        int i;
        SBar(int i, int j);
    
    private:
        int j;
    };

    int main()
    {
        //编译错误
        SBar bar{1, 2};
    }
```
  
  * 类内含有虚函数或者是继承类时

```cpp
    struct SBar
    {
        int i;
        virtual void foo(){}
    }

    struct SBaz : public SBar
    {
        int j;
    }

    int main()
    {
        //编译错误
        SBar bar{1};
        SBaz baz{1,2};
    }
```
  * 上述几种情况都可以用构造函数的成员初始化列表解决

# std::initializer_list
* STL中初始化列表的使用其实是模板initializer_list<>的一部分。对于任意个数的初始化值，initializer_list将会依次调用构造函数对每个值进行初始化。

```cpp
//下面两个声明是等价的
    std::vector<int> foo{1, 2, 3, 4};
    //原型是std::vector<int> foo(std::initializer_list<int>())
    std::vector<int> foo({1, 2, 3, 4});
```

* initializer_list的好处就是可以在初始化阶段填入任意数量的同类型初始化值。并且可以将此功能运用到自定义类中。

```cpp
    struct SBar
    {
        int i;
        int j;
        int k;

        //在构造函数的形参中调用initializer_list来构造参数
        SBar(std::initializer_list<int> list)
        {
            auto it = list.begin();
            i = *it++;
            j = *it++;
            k = *it++;
        }
    };

    int main()
    {
        SBar bar{1, 2, 3};
        //参数数量少于初始化参数
        SBar baz{1, 2};
        //参数数量少于初始化参数
        SBar foo{1, 2, 3, 4};

        std::cout << bar.i << "/t" << bar.j << "/t" << bar.k << std::endl;
        std::cout << "----------------------------------------------------------"<< std::endl;
        std::cout << baz.i << "/t" << baz.j << "/t" << baz.k << std::endl;
        std::cout << "----------------------------------------------------------"<< std::endl;
        std::cout << foo.i << "/t" << foo.j << "/t" << foo.k << std::endl;

        return 0;
    }
```

* 下面是结果,可以看到如果初始化参数数量少于类参数数量，多出来的参数是用随机值初始化的。如果多余类参数数量，则只初始化类参数数量。

```cpp
1	2	3
----------------------------------------------------------
1	2	1
----------------------------------------------------------
1	2	3
```

* 初始化时（）与 { } 的区分

```cpp
    //初始化1个int类型元素，初始值是10
    std::vector<int> foo{10};
    //构造10个int类型元素，初始化值为0
    std::vector<int> foo(10);
    //初始化1个int类型元素，初始值是10
    std::vector<int> foo({10});
    //初始化10个int类型元素，初始值为1
    std::vector<int> foo(10, 1);
```

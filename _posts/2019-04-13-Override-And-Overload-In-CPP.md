---
layout: post
title: "C++中的Overload和Override"
subtitle: "Overload And Override In C++"
author: "李AA"
header-img: "img/blog-bg-flower.jpg"
tags:
    - C++
---

* TOC
{:toc}


# 前言
* C++中的override和overload是多态和封装体系里面两个重要工具。对于static bind和dynamic bind的理解不够，导致无法很好的运用这两部分。所以在此做个总结。

# Overload
* overload被称为重载，是对于c时代历史问题的改进。主要功能是在```同一作用域内```,函数名相同，参数类型或者参数个数不同，返回值可以相同可以不同，这样的两个函数可以作为两个不同的函数声明。

* 函数重载是通过参数列表来区分具体调用。```所以参数列表相同，返回值不同的函数并不能完成重载。```

* 函数重载的意义是为了减少对类似功能的函数名的记忆，我自己理解对于类成员函数的封装也能起到```提供简洁高效接口```的效果。

* 函数重载本身是静态绑定的。

* 可以看下具体例子：

```cpp
#include <iostream>
class Overloader
{
public:
   //原函数
   void overloadMe(){std::cout << "overloadMe" << std::endl;}
   //重载带一个参数
   void overloadMe(uint8_t i){std::cout << "overloadMe with argument" << i << std::endl;}
   //重载带两个参数
   void overloadMe(uint8_t i, cont char* ch){std::cout << "overloadMe with two arguments " << i << " and " << ch <<    std::endl;}

   //无参数带不同返回类型的重载
   //编译报错，有相同参数列表的函数声明
   const char* overloadMe(){return "overloadMe with return value";}

   //一个参数带不同返回类型的重载
   //编译报错，有相同参数列表的函数声明
   const char* overloadMe(uint8_t i){std::cout << "overloadMe with argument" << i << std::endl; 
   return "overloadMe with return value";}

   //两个与之前不同类型参数带不同返回类型重载
   const char* overloadMe(uint8_t i, uint16_t j)
   {std::cout << "overloadMe with two arguments " << i << " and " << j << std::endl; 
   return "overloadMe with return value";}
};
int main()
{
    const char* c_arg = "I'm test overloader argument";
    uint8_t n_arg01 = 1;
    uint16_t n_arg02 = 2;
    Overloader overloader;
    overloader.overloadMe();
    std::cout << "-------------------------------------------------------" << std::endl;
    overloader.overloadMe(n_arg01);
    std::cout << "-------------------------------------------------------" << std::endl;
    overloader.overloadMe(n_arg01, c_arg);
    std::cout << "-------------------------------------------------------" << std::endl;
    const char* c_temp = overloader.overloadMe(n_arg01, n_arg02);
    std::cout << c_temp << std::endl;
    return 0;
}
```

* 下面是结果

```cpp
overloadMe
-------------------------------------------------------
overloadMe with argument 1
-------------------------------------------------------
overloadMe with two arguments 1 and I'm test overloader argument
-------------------------------------------------------
overloadMe with two arguments 1 and 2
overloadMe with return value
```
* 可以看到overloadMe这个函数名被重载了四次，大大提高了函数名的利用率与接口的简洁性。

# Type
* 这里涉及到静态类型和动态类型。静态类型是对象在```声明时所使用的类型。```动态类型通常指```一个指针或引用实际指向的类型，```这个类型在运行时才能知道。

* 绑定在编译阶段也叫符号决议，也就是找到函数名对应的地址，在函数调用
时用该地址替换。静态绑定便是在编译期间就可以完成符号决议，```而在运行期间才能
确定函数具体调用地址的就是动态绑定了。```

* 看下具体例子(这里先不讨论动态绑定是否完成)：

```cpp
class A
{
  (...)
};
class B : public A
{
  (...)
};
class C : public A
{
  (...)
};
int main()
{
    //a的静态类型和动态类型都是A
    A* a = new A;
    //A的静态类型是A,动态类型是B
    A* a = new B;
    //指针地址传递以后，a的静态类型还是A,动态类型是C
    C* c = new C;
    a = c;
}
```

# Override
* override被称为重写，多态体系的核心功能。主要功能为在子类中重写父类的```虚函数```，从而可以在动态绑定后```通过绑定对象来决定调用的函数```。

* 重写的实现是通过在声明过虚函数的类头部增加一份vtable，vtable中放置所有虚函数的入口地址,k可以理解为指针数组。子类继承后也会有一张相同vtable，如果```子类重写了虚函数```，则vtable中的这一个函数地址就会被```重写后的函数地址取代。```每个类实例化后都会有一个指向其vtable的指针vptr，对象调用类成员函数时便会从其中查找函数地址了。

* 重写可以实现的条件
  * <span id = "override">必须在不同作用域内</span>
  * 在父类和子类之间
  * 父类中需要声明虚函数，虚函数只能是成员函数
  * 函数名，参数和返回类型必须相同  

```cpp
//没有虚函数的父类
class A_NV
{
public:
    void foo(){std::cout << "Class A_NoVirtual" << std::endl;}
};
//带虚函数的父类
class A_V
{
public:
    virtual void foo(){std::cout << "Class A_Virtual" << std::endl;}
};
//因为不是虚函数重写所以子类会隐藏父类同名函数
class B_NV : public A_NV
{
public:
    void foo(){std::cout << "Class B_NoVirtual" << std::endl;}
};
//子类重写父类虚函数
class B_V : public A_V
{
public:
    void foo() override {std::cout << "Class B_Virtual" << std::endl;}
};
int main()
{
    //调用A_NV的foo()
    A_NV* a_nv = new A_NV();
    a_nv -> foo();
    std::cout << "--------------------------------------------" << std::endl;
    //这里期望调用的是B_NV的foo(),但是动态绑定没有成功，所以使用了静态类型
    A_NV* a_nv = new B_NV();
    a_nv -> foo(); 
    std::cout << "--------------------------------------------" << std::endl;
    //调用A_V的foo()
    A_V* a_v = new A_V();
    a_v -> foo();
    std::cout << "--------------------------------------------" << std::endl;
    //这里期望调用B_V的foo(), 因为override成功，所以动态绑定完成
    A_V* a_v = new B_V();
    a_v -> foo();
    delete a_nv;
    delete a_v;
    return 0;
}
```

* 下面是结果
```cpp
Class A_NoVirtual
--------------------------------------------
Class A_NoVirtual
--------------------------------------------
Class A_Virtual
--------------------------------------------
Class B_Virtual
```

* ```关于虚函数有几点需要注意的：```
  * 如果类中某函数声明为virtual，这个类的继承体系中所有子类的此函数都是virtual的
  * 静态成员函数不能声明为virtual
  * 类的析构函数一般情况都声明为virtual
  * 纯虚函数实现的接口类在设计模式中很有用 


# Overload with Override
* 虚函数也是可以重载的。理解的关键点在于[重载](#overload)和[重写](#override)的作用域。

* 可以看下例子：

```cpp
class Overloader
{
public: 
    virtual void OverloadMe(){std::cout << "Class Overloader With No Argument" << std::endl;}
    virtual void OverloadMe(uint8_t i){std::cout << "Class Overloader With Argument " << i <<std::endl;}
};
class Overloader_C : public Overloader
{
public:
    void OverloadMe() override {std::cout << "Class Overloader_C With No Argument" << std::endl;}
    void OverloadMe(uint_8 i) override {std::cout << "Class Overloader_C With Argument " << i << std::endl;}    
};
int main()
{
    uint8_t i = 1;
    Overloader overloader;
    overloader.OverloadMe();
    overloader.OverloadMe(i);
    Overloader* p_overloader = new Overloader_C();
    p_overloader -> OverloadMe();
    p_overloader -> OverloadMe(i);
    delete p_overloader;
    return 0;
}
```

* 看下结果：

```cpp
Class Overloader With No Argument
--------------------------------------------
Class Overloader With Argument 1
--------------------------------------------
Class Overloader_C With No Argument
--------------------------------------------
Class Overloader_C With Argument 1
```
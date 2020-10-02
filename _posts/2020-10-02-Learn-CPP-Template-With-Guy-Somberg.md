---
layout: post
title: "和Guy Somberg学习C++ Template"
subtitle: "Learn C++ Template With Guy Somberg"
author: "李AA"
published: true
header-img: "img/blog-bg-mass.jpg"
tags:
    - C++
    - Template
    - Smart Pointer
---


- [前言](#前言)
- [How We Use C++](#how-we-use-c)
- [右值引用与移动语义](#右值引用与移动语义)
  - [1. 为什么要用右值引用以及移动语义](#1-为什么要用右值引用以及移动语义)
  - [2. 右值](#2-右值)
  - [3. 右值引用](#3-右值引用)
  - [4. 转移语义](#4-转移语义)
  - [5.完美转发](#5完美转发)
- [可调用对象](#可调用对象)
- [参数包](#参数包)
- [智能指针](#智能指针)
- [自动类型推导](#自动类型推导)
  - [1.为什么需要类型推导](#1为什么需要类型推导)
  - [2. auto](#2-auto)
  - [3. decltype](#3-decltype)
  - [4. std::result_of<>](#4-stdresult_of)

# 前言

* ### 记得刚看Guy Somberg在cppcon演讲的时候，有段讲到```How We Use C++```看的真是一头雾水，一年后再翻出来看除了依然觉得有些```秀```的成分，但是还是能从他的示例里延展开学习到很多C++11/14结合Generic Programming的东西，也是一些我觉得实用性很强的东西。再次给Guy哥瑞斯拜！

# How We Use C++

  ![](/img/in-post/EBP/WithHint.png)

* ### 第一眼看过去感觉就是一个非常泛型的PostEvent函数，把```对象/可调用对象/参数```都模板化了，然后调用的时候再组装起来。可以感觉到用了很多```右值引用```,也能看到用了一些标准库的新模板函数。

* ### 这么写的意义是什么?

# 右值引用与移动语义

## 1. 为什么要用右值引用以及移动语义

* ### 在Cpp里面，一切的最终目的都是为了性能。右值引用解决的是各种情形下```对象的资源所有权转移```的问题。移动语义则是对于```对象构造的性能优化。```右值是一个临时对象，如果没有被绑定到引用，在表达式结束时就会被废弃。于是我们可以在右值被废弃之前，移走它的资源进行废物利用，从而避免无意义的复制。被移走资源的右值在废弃时已经成为空壳，析构的开销也会降低。

## 2. 右值

* ### 左值(Lvalue)：Location-value，表示可寻址。是保存在内存中，```具有确切地址，并能取地址，进行访问，修改等操作的表达式。```

* ### 右值(Rvalue)：Read-value，表示可读不可寻址。是保存在内存中，或者寄存器中，```不知道也无法获得其确切地址，在得到计算表达式结果后就销毁的临时表达式。```

```cpp
int a = 1; //a是左值，1是右值
const int b = 1; //b是只读的左值，1是右值
a = b + 1; //a是左值，b+2是右值

int x = 0; //x是左值
int* y = &++x; //前置++返回的是左值，可以取地址
++x = 1; //前置++返回的是左值，可以赋值
y = &x++; //后置++返回的是右值，无法取地址和赋值
```

## 3. 右值引用

* ### C++11/14开始，使用```&&```表示右值引用,```&```表示左值引用。

* ### 对一个对象使用右值引用就是告诉编译器这个对象是右值，可以被用作转移。这个右值引用也就成了这个对象的别名，意味着```对象的生命周期也和这个引用绑定在了一起```，离开作用域后右值对象依然存在。

* ### 右值引用只能绑定到临时对象，临时对象大多是```字面常量```或者```作用域内创建的临时对象```，这些对象都是离开作用域后会被销毁的，也没有```所有权归属问题```的对象，这就意味着```右值引用可以安全的接管所引用对象的资源。```

* ### 万能引用```const &```依然可以同时引用左值和右值对象。

* ### 引用有一些折叠的规则
  * 所有右值引用折叠到右值引用上仍然是一个右值引用。(A&&&& 变成 A&&)
  * 所有的其他引用类型之间的折叠都将变成左值引用。(A&& 变成 A&; A&&& 变成 A&; A&&& 变成 A&）

```cpp
int a = 1;
int& b = a; //b是左值引用
int&& c = 1; //c是右值引用，接管了资源1

int& x = ++x; //前置++返回左值，x是左值引用
int&& x = x++; //后置++返回右值, x是右值引用
const int& x = x++; //注意const左值引用也是可以绑定右值的
```

## 4. 转移语义

* ### 右值引用的最常用的就是实现```移动构造函数```与```移动赋值运算符重载```，从而实现```零成本```构造对象。

* ### 关于构造函数与深拷贝问题可以参考这篇[C++构造函数的一些注意事项](https://zhuanlan.zhihu.com/p/110773368)

* ### 标准库函数```std::move()```就可以将一个左值强制标记为右值，用作右值引用，本质也是告诉编译器这个对象现在没有```所有权```问题了。

```cpp
class ZeroCost
{
public:
  ZeroCost() = default; // 无参构造函数
  ~ZeroCost() = default; // 析构函数
  ZeroCost(const std::string& InName, TSharedPtr<int> InNum) : Name(std::move(InName)), Num(InNum) {} //带参构造函数

  ZeroCost(const ZeroCost& InObject); //拷贝构造函数
  ZeroCost(ZeroCost&& InObject) noexcept; //移动构造函数

private:
  std::string Name;
  std::shared_ptr<int> NumPtr;
};

ZeroCost::ZeroCost(const ZeroCost& InObject)
{
  this->Name = InObject.Name; //拷贝资源
  this->Num = std::shared_ptr<int> TempNumPtr(new int(InObject.Numptr->Get())) //开新地址拷贝资源
};

ZeroCost::ZeroCost(ZeroCost&& InObject)
{
  Name.empty();
  std::swap(Name, InObject.Name); //移动资源，所有权转移
  this->NumPtr.reset(InObject.NumPtr); //移动资源， 所有权转移
  InObject.NumPtr->reset(); //旧指针可以置空了
};
```

```cpp
int main()
{
  ZeroCheck BaseObj = new ZeroCost();

  ZeroCheck CopyObj(BaseObj); //拷贝构造
  ZeroCheck AnotherCopyObj = BaseObj; //拷贝构造

  ZeroCheck MoveObj = std::move(BaseObj); //移动构造
};
```

## 5.完美转发

* ### 当我们将一个右值引用传入函数时，他的```实参```有了```命名```，所以继续往下传或者调用其他函数时，这个参数```变成了一个左值```。那么他永远不会调用接下来函数的右值版本，这可能在一些情况下造成```拷贝```。

* ### 可以看到GuySomberg在传参的时候使用了一个```std::forward()```,这就是C++11提供的完美转发。完美转发实现了```参数在传递过程中保持其值属性```的功能，即```若是左值，则传递之后仍然是左值,若右值，则传递之后仍然是右值。```

* ### 完美转发的出现是因为模板参数作为右值引用的时候，编译器会```推断```传入的实参属性```(引用折叠规则)```来做为实际属性处理。

```cpp
class ZeroCost
{
public:
  template<typename T>
  ZeroCost(T&& InName) : Name{std::forward<T>(InName)} {}

private:
  std:string Name;
};
```
```cpp
int main()
{
  const std::string& ObjectName = {"NewObject"};
  ZeroCost<std::string> LValueObject(ObjectName);

  1. 模板参数传递了一个左值，模板推导T =  std::string&
  2. T&&&折叠后变为T&,也就是std::string&
  3. 构造函数最后形态ZeroCost(std::string& InName) : Name{std::forward<std::string&>(ObjectName)}
  4. std::forward<std::string&>(ObjectName)返回的是左值，所以调用的是拷贝构造函数
};
```

```cpp
int main()
{
  ZeroCost<std::string> RValueObject("NewObject");

  1. 模板参数传递了一个右值，模板推导T =  std::string
  2. T&&折叠后变为T&&,也就是std::string&&
  3. 构造函数最后形态ZeroCost(std::string&& InName) : Name{std::forward<std::string&&>("NewObject")}
  4. std::forward<std::string&&>("NewObject")返回的是右值，所以调用的是移动构造函数
}
```

# 可调用对象

```cpp
template<typename Fxn, typename ...Ts>
using MemberFunctionReturn = typename std::result_of<Fxn&&(FFMODPlayingEvent&&, Ts&&...)>::type;
```

* ### GuySombery这段代码非常简练，遇到```::```符号的时候要注意用```typename表示是一个类型而不是作用域```,要多运用typename和using来优化代码的阅读体验，最重要的是可以大大```减少类型更改或者改名的工作量。```

* ### 这里可以看出Fxn模板参数是需要传入一个Callable Object，对于C++11一定要习惯Callable Object的概念，具体可以参考这篇文章[C++中的可调用对象学习](https://zhuanlan.zhihu.com/p/110591071),GuySombery这里是把函数作为```右值Callable Object来处理```，参考前面说到的[完美转发](#5完美转发)这样声明可以保证传入的Callable Object```无论是左值还是右值都可以保证拿到返回值类型。```

* ### ```选择恰当的容器配合标准库中的算法与iterator```，用Callable Object的概念可以实现很多高效且无副作用的函数式编程范式，在一些情况下会非常有用。


# 参数包

* 用过python的朋友应该很熟悉不定长参数了，c++中以参数包的形式来表示不定长参数,对于模板的不定长参数最常用法就是递归解包了

* 声明时```...类型名```打包，使用时```类型名...```解包。需要声明一个递归结束函数。

```cpp

template<typename T>
void Foo(T arg)
{
  EndOfDoSomthing(arg); //递归解包结束操作
  return;
};

template<typename T, typename ...Ts>
void Foo(T arg, Ts... args) //这里arg就是当前解包出的数据，args是待递归解包的数据
{
  DoSomething(arg); //处理当前解包数据
  Foo(args...); // 递归解包
};

int main()
{
  Foo(1, 1.5, 'a');
};

```

# 智能指针

```cpp
auto PlayEventShared = GetPlayingEvent(PlayingEventId);
auto* PlayingEvent = PlayEventShared.Get();
```

* ### C++编程第一原则，```避免使用裸指针。```使用智能指针有时候确实会比用裸指针繁杂一些，但是等工程庞大复杂之后就会感到智能指针真的是最亲切的工具了。

* ### 共享指针的RAII技术是应该重点掌握的，可以参考[Smart Pointers与RAII](https://zhuanlan.zhihu.com/p/261146118)

* ### 这里想讨论下```移动语义```和```unique_ptr```这对绝佳组合

```cpp
unique_ptr本身是不支持拷贝和赋值的，但是在移动语义的支持下可以在函数中轻松的返回unique_ptr

template <typename T>
std::unique_ptr<T> Clone(const T& Obj)
{
　　return std::unique_ptr<T>(new T(Obj));
};


再有就是移动语义下，vector插入的时候不再复制操作而是移动的话，就可以在vector里面放unique_ptr了，这就意味着享受了便捷的同时还享受了安全，突然有种在写python的感觉...

template<typename T>
class ManagerMyPtr
{
public:
  void Add2Manager(const T& Obj)
  {
    Resources.push_back(Clone(T));
  }  

private:
  std::vector<unique_ptr<T>> Resources;
};
```

# 自动类型推导

## 1.为什么需要类型推导

* ### Generic Programming里面涉及到大量的```人工很难直接写出的类型```或者伴随```未知类型操作的用法```。可是这些类型信息编译器是知道的，只是之前不会暴露给你而已，引用某本书的说法，```自动类型推导是将编译器无上的权利赋予了你。```

## 2. auto

* ### auto是```运行时的类型推导```，必须时初始化的变量才能推导出来，所以不可用作变量声明。

* ### auto总是推导出值类型！！！

* ### auto&&总是推导出引用类型！！！

```cpp
auto i = 2; //i为int
auto i = "Hello"; //i为const char*
auto i = m.begin(); //i为iterator类型
auto i = [&](int x){ return x;} //i为Callable Object
float j = 1.f;
auto&& i = j; //i为float引用类型
auto i = std::less<T>(); //i为Callable Object

C++14中auto已经可以推导出表达式返回值类型了！
auto Foo(int x)
{
  return x*x;
};

```

## 3. decltype

* ### decltype是```编译时的类型推导```,可以用在变量/类型声明，函数/模板的参数列表等

* ### decltype()获取的是值类型！！！

* ### decltype(())获取的是引用类型！！！

```cpp
int j = 1;
decltype(j) i = j; //i类型是int
decltype(j)& i = j; //i类型是int&
decltype(*j) i = &j; //i类型是int*
decltype((j)) i = j; //i类型是int&

decltype(std::greater<T>()) MyFuncObj; //声明一个Callable Object
decltype(i)::iterator iter; //推导i的类型再获取其iterator类型

template<typename T>
class Foo {};
Foo<decltype(j)> NewFoo; //相当于Foo<int>()
```

## 4. std::result_of<>

```cpp
template<typename Fxn, typename ...Ts>
using MemberFunctionReturn = typename std::result_of<Fxn&&(FFMODPlayingEvent&&, Ts&&...)>::type;
```

* ### GuySomberg在这里使用了```std::result_of```获取返回值类型，对于可调用对象的推导使用std::result_of在书写上会更优雅一些，本质上std::result_of是可以用decltype实现的。

* ### 对于```Callable Object```的推导还是推荐像Guy老哥一样使用```std::result_of```吧。

```cpp
GCC4.5中std::result_of的实现

template<typename _Signature>
class result_of;

template<typename _Functor, typename... _ArgTypes>
struct result_of<_Functor(_ArgTypes...)>
{
  typedef decltype( std::declval<_Functor>()(std::declval<_ArgTypes>()...) ) type;
};
```


  

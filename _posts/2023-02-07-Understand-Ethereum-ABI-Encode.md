---
layout: post
title: "以太坊ABI数据的理解与分析"
subtitle: "Understand ABI Encoding of EVM"
author: "jazzlost"
published: true
header-img: "img/blog-bg-tree.jpg"
tags:
    - Blockchain
    - Ethereum
    - Data Analysis
    - Dune Analytics
---

# 前言

当我们需要进行一些链上原始数据分析的时候，常常需要直接对合约的 ABI 信息进行解析。理解 ABI 编解码对于链上数据的分析是很关键的，本文会从 **ABI 编码**与 **Dune Analytics 数据分析**两方面来加深对链上原始数据的理解。

# ABI 介绍

## 字节码(bytecode)

**ABI (Application Binary Interface)** 是应用二进制接口的统称，我们这里讨论的是针对 **EVM(Ethereum Virtual Machine)** 的 ABI 标准。ABI 是外部账户(EOA)与合约或合约间进行交互的标准，定义了交互信息的编码格式，最直观的理解就是描述了合约中函数接口和事件的签名和参数类型。

Solidity 属于强类型静态语言，编写的合约需要编译成字节码和 ABI 接口定义等数据才能使用。从下图可以看到最后上链的只是字节码，但是进行合约交互时 EVM 同时需要字节码与 ABI 接口定义才能工作。

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Ethereum_ABI/1620.png)



字节码是十六进制的数字编码的字节数组，EVM 以字节为单位读入字节码并且翻译成对应的汇编指令(EVM 指令集)以进行相应的系统操作。编译后的字节码中是不包含类型信息的，所以单纯的字节码是无法使用的。

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Ethereum_ABI/ByteCode.png)

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Ethereum_ABI/OpCode.png)

## 接口定义

### 函数

ABI 接口定义一般是输出为 JSON 格式，其中包含外部可调用接口的名字，参数，类型等信息。

```solidity
function foo(uint a, uint32 b, bool c) external returns(bool){}
```
下面是这个函数的 ABI 输出, 需要注意`uint`会转换为全称`uint256`，接口`type`有`function / constructor / fallback / event` ， `stateMutability` 有`pure / view / nonpayable / payable`。
```json
	{
        // 接口参数
		"inputs": [
			{
				"internalType": "uint256", //第一个参数的内置类型
				"name": "a", //第一个参数名字
				"type": "uint256"//第一个参数的类型
			},
			{
				"internalType": "uint32",//第二个参数的内置类型
				"name": "b",//第二个参数名字
				"type": "uint32"//第二个参数的类型
			},
			{
				"internalType": "bool",//第三个参数的内置类型
				"name": "c",//第三个参数名字
				"type": "bool"//第三个参数的类型
			}
		],
		"name": "foo",//接口名称
        //接口返回值信息
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",//接口对状态变量的读写权限, 默认值
		"type": "function"//接口类型
	}
```

### 状态变量

我们知道合约内声明为`public`的状态变量，编译时会自动生成一个`getter`接口, 在 ABI 定义中也有体现。

```solidity
uint256 public num = 0;
```

```json
{
    "inputs": [],
    "name": "num", //接口名称与变量同名
    "outputs": [
        {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
        }
    ],
    "stateMutability": "view",//读写权限为 view
    "type": "function"//function类型
}
```

### 事件

然后事件的定义也会放入 ABI 定义中，区别就是`type`类型是`event`，这里的参数可以带`indexed`标识，用来作为后续交互时的快速检索和过滤。

```solidity
event fooEvent(uint indexed, address indexed, bytes);
```

```json
{
	"anonymous": false,//事件是否匿名
    //事件的参数
	"inputs": [
		{
			"indexed": true,//是否indexed参数
			"internalType": "uint256",
			"name": "",
			"type": "uint256"
		},
		{
			"indexed": true,
			"internalType": "address",
			"name": "",
			"type": "address"
		},
		{
			"indexed": false,
			"internalType": "bytes",
			"name": "",
			"type": "bytes"
		}
	],
	"name": "fooEvent",//事件名称
	"type": "event"
}
```
### 结构体

单独的结构体无法被外部调用，但是结构体作为参数时，就需要 ABI 来进行定义。

```solidity
struct holder
{
    uint index;
    address addr;
}

function bar(holder memory _holder) external {}
```

```json
{
    "inputs": [
        {
            // 结构体参数
            "components": [
                {
                    "internalType": "uint256", 
                    "name": "index", // 结构体中第一个参数名
                    "type": "uint256" // 结构体中第一个类型
                },
                {
                    "internalType": "address", 
                    "name": "addr", // 结构体中第二个参数名
                    "type": "address" // 结构体中第二个类型
                }
            ],
            "internalType": "struct myContract.holder", // 结构体类型
            "name": "_holder", // 结构体名字
            "type": "tuple" // 结构体类型标识
        }
    ],
    "name": "bar", // 函数名
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}
```



# ABI 编码

当我们与合约进行交互时，其实是向合约发送了一段 **calldata**, 这段 **calldata** 包含了经过 **ABI** 编码的指定调用函数已经传入的参数等信息，交易信息中的 **Input** 字段就是这个 **calldata** 数据。

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Ethereum_ABI/Calldata.png)

### 函数选择器

**calldata** 的前四个字节(8个十六进制字符)是函数选择器，函数选择器是函数签名的 **keccak256** 哈希结果的前四个字节。

```solidity
bytes4(keccak256("foo(uint256, uint32, bool)"));  // 0x7956f29a
```

### 参数编码

从第五个字节开始是参数的编码，分为固定长度类型与动态长度类型编码。各种位长的 int / uint / bytes, address, bool 都是固定长度类型。各种数组，字节数组，string 属于动态长度。如果使用 Remix 交互，可以用下图位置复制 **calldata**

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Ethereum_ABI/Get_Calldata.png)

#### 固定长度类型

固定类型数据一律编码为32字节长度，从左向右按大端字节序存储，**不足32字节的部分用0补足**。还是用上面的例子来演示

```solidity
    function function foo(uint, uint32, bool) external pure{}
    
    foo(10, 2, true);
```

```json
0x7956f29a
000000000000000000000000000000000000000000000000000000000000000a
0000000000000000000000000000000000000000000000000000000000000005
0000000000000000000000000000000000000000000000000000000000000001
```

1. `0x7956f29a ` 函数选择器编码
2. `000000000000000000000000000000000000000000000000000000000000000a` 第一个参数**10**的十六进制编码
3. `0000000000000000000000000000000000000000000000000000000000000005` 第二个参数**5**的十六进制编码
4. `0000000000000000000000000000000000000000000000000000000000000001` 第三个参数**true**的十六进制编码

#### 动态长度类型

动态长度类型参数的编码，首先会保存一个偏移值，也就是从参数编码开始到真正存储编码数据的位置的偏移量，然后才是保存动态类型的长度以及其中的数据， 这里调用`bar(5, [1, 2], "abcd", "hello, world")`

```solidity
function bar(uint32[] memory,  bytes memory) external pure{}

bar([0x456, 0x789], "0x626172");
```

```json
0xcd989d6d
0000000000000000000000000000000000000000000000000000000000000040
00000000000000000000000000000000000000000000000000000000000000a0
0000000000000000000000000000000000000000000000000000000000000002
0000000000000000000000000000000000000000000000000000000000000456
0000000000000000000000000000000000000000000000000000000000000789
0000000000000000000000000000000000000000000000000000000000000003
6261720000000000000000000000000000000000000000000000000000000000
```

1. `cd989d6d` 函数选择器编码
2. `0000000000000000000000000000000000000000000000000000000000000040` 第一个参数偏移值的十六进制编码
3. `00000000000000000000000000000000000000000000000000000000000000a0` 第二个参数偏移值的十六进制编码
4. `0000000000000000000000000000000000000000000000000000000000000002` 第一个参数的数组大小
5. `0000000000000000000000000000000000000000000000000000000000000456` 第一个参数数组的第一个数据
6. `0000000000000000000000000000000000000000000000000000000000000789` 第一个参数数组的第二个数据
7. `0000000000000000000000000000000000000000000000000000000000000003` 第一个参数的数组大小
8. `6261720000000000000000000000000000000000000000000000000000000000` 第二个参数值，右侧补全到32字节

### Solidity 编码接口

`abi.encode` 可以对参数进行编码

```solidity
uint x = 10;
address addr = 0x02a5fBb259d20A3Ad2Fdf9CCADeF86F6C1c1Ccc9;
string str = "Hello World";
uint[] array = [1, 2, 3]; 

function encodeData external view returns(bytes memory)
{
	return abi.encode(x, addr, str, array);
}
```

```json
000000000000000000000000000000000000000000000000000000000000000a     //x
00000000000000000000000002a5fbb259d20a3ad2fdf9ccadef86f6c1c1ccc9          //addr
0000000000000000000000000000000000000000000000000000000000000080    //str的偏移
00000000000000000000000000000000000000000000000000000000000000c0	//array的偏移
000000000000000000000000000000000000000000000000000000000000000b	//str的长度
48656c6c6f20576f726c64000000000000000000000000000000000000000000	  //str数据
0000000000000000000000000000000000000000000000000000000000000003	//array的长度
0000000000000000000000000000000000000000000000000000000000000001	//array第一个数据
0000000000000000000000000000000000000000000000000000000000000002	//array第二个数据
0000000000000000000000000000000000000000000000000000000000000003	//array第三个数据
```



`abi.encodePacked` 进行压缩编码，编码数据长度减小很多。压缩编码不能与 EVM 交互，适合进行哈希运算或者存储

```solidity
function encodeData external view returns(bytes memory)
{
	return abi.encodePacked(x, addr, str, array);
}
```

```json
0x000000000000000000000000000000000000000000000000000000000000000a02a5fbb259d20a3ad2fdf9ccadef86f6c1c1ccc948656c6c6f20576f726c64000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003
```



`abi.encodeWithSignature` 同时编码函数选择器与参数

```solidity
function encodeData external view returns(bytes memory)
{
	return abi.encodeWithSignature("foo(uint256, address, string, uint256[2])", x, addr, str, array);
}
```

```json
e0d856f6	//函数选择器
000000000000000000000000000000000000000000000000000000000000000a
00000000000000000000000002a5fbb259d20a3ad2fdf9ccadef86f6c1c1ccc9
0000000000000000000000000000000000000000000000000000000000000080
00000000000000000000000000000000000000000000000000000000000000c0
000000000000000000000000000000000000000000000000000000000000000b
48656c6c6f20576f726c64000000000000000000000000000000000000000000
0000000000000000000000000000000000000000000000000000000000000003
0000000000000000000000000000000000000000000000000000000000000001
0000000000000000000000000000000000000000000000000000000000000002
0000000000000000000000000000000000000000000000000000000000000003
```



`abi.encodeWithSelector` 第一个参数变为函数选择器，其它时一样的

```solidity
function encodeData external view returns(bytes memory)
{
	return abi.encodeWithSelector(bytes4(keccak256("foo(uint256, address, string, uint256[2])")), x, addr, str, array);
}
```

# ABI 调用

## solidity

在 solidity 中， `call`与`delegatecall`是直接用来发送 abi 编码与合约交互的函数，两个都是`address`的类型函数，具体区别是调用时上下文对象会有差异，具体差异可以参考[Delegatecall | WTF学院](https://wtf.academy/solidity-advanced/Delegatecall/)。返回值中有执行结果以及交互合约的返回值。

```
address.call{ value:发送的ETH金额, gas: 指定的gas数额 }(abi编码)
address.delegatecall{ gas: 指定的gas数额 }(abi编码)
```

```solidity
address contract_addr = 0x4e15361fd6b4bb609fa63c81a2be19d873717870;

(bool res, bytes memory data) = contract_addr.call{value: msg.value}(
abi.encodeWithSignature("foo(uint256, address, string, uint256[2])", x, addr, str, array);

(bool res, bytes memory data) = contract_addr.delegatecall(
abi.encodeWithSignature("foo(uint256, address, string, uint256[2])", x, addr, str, array);
```

## web3.py

也可以使用 web3.py 和 abi 数据来进行交互。进行读操作的时候使用`call`, 进行写操作的时候使用`transact`

```python
contract_addr = '0x4e15361fd6b4bb609fa63c81a2be19d873717870'
contract_abi = json.loads("./abi.json")

contract_obj = w3.eth.contract(address=contract_addr, abi=contract_abi)

contract_obj.total_supply().call();

contract_obj.functions.transfer(web3.eth.accounts[1], 12345).transact()
```

## ether.js

ether.js 与 EVM 的交互在安全性与便捷性上都很好，而且内置支持了ENS

```javascript
const abi = [
    "function total_supply() public view returns(uint256)",
    "function transfer(address, uint) public returns (bool)"
];

const contract_addr = '0x4e15361fd6b4bb609fa63c81a2be19d873717870'

const contract_obj = new ethers.Contract(contract_addr, abi, wallet)

const supply = await contract_obj.total_supply()

const tx = await contract_obj.transfer("vitalik.eth", ethers.utils.parseEther("0.001"))
```



# ABI 数据分析

如果我们使用 Dune Analytics 进行数据分析工作，大概率会从 Decoded Projects 或者 Spells 开始，因为它们都是经过解码并且归类的更高级的查询数据，可以更高效的完成分析工作。但是这些高级数据往往有一定的延迟，或者对于新项目或者冷门项目没有支持。所以很多时候我们还是需要从 Raw 数据开始，亲自解析 calldata 数据进行分析。上文我们学习了 abi 的数据结构与编码，也是为了更好的进行 calldata 数据的分析。



在进行 calldata 分析的时候，有几个常用的函数(基于 Dune Engine V2 Spark SQL)：

`substring()`: 用来按长度读取字节码，ABI 编码数据都是32字节长度，按这个长度读取解析

`bytea2numeric_v2`: 将字节码转成数值型

`hex(string)`: 将字符串转为字节码

另外几个数据也需要关注：

`decimals`: 还需要注意我们分析的代币的小数位

`topics1`: Dune 的 topics1 对应 EVM 事件中的 topic0, 是事件的签名哈希可以用来定位我们希望分析的接口

## 调用数据查询

从函数调用的 **calldata** 中直接解析数据的情况比较少，但是某些没有对应日志可以用来分析的情况下就会特别有用。这里我们 **Velodrome Finance: Router(0x9c12939390052919aF3155f41Bf4160Fd3666A6f)** 这个合约的 `swapExactTokensForTokens` 接口调用来进行一个分析, **这里我们限定只查询 WETH 兑换 OP 的调用**。

### 1.函数签名和函数选择器确认

Etherscan 打开一个 [Velodrome Finance: Router](https://optimistic.etherscan.io/address/0x9c12939390052919af3155f41bf4160fd3666a6f) 的交易记录，打开一条 Method 显示 `swapExactTokensForTokens` 的交易，在Input Data就可以看到函数的签名以及函数选择器(MethodID)

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Ethereum_ABI/InputData.png)



### 2. 确认函数参数意义

参数中有个 `tuple` 类型, 需要在合约源码中确认数据结构。

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Ethereum_ABI/SwapExactTokenForToken.png)

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Ethereum_ABI/routes.png)

最后可以看到 `tuple`其实是一个 `router` 类型数组，`router` 里面定义了两个 `address` 与一个 `bool` 类型。`from`是源代币的地址，`to`是要兑换的代币地址， `stable`代表代币中是否有稳定币

### 3. 解析 data

因为我们只查询 WETH 兑换 OP 的调用， 所以需要先查询到 WETH 与 OP 的代币合约地址

WETH: 0x4200000000000000000000000000000000000006

OP: 0x4200000000000000000000000000000000000042

然后就可以开是写SQL了，以32字节为一组，按照刚才确定参数类型进行具体值的解析

```sql
SELECT
    `block_time`, 
    bytea2numeric_v2(substring(`data`, 11, 64)) / 1e18 AS amountIn, -- 第11个字符开始解析，前面是函数选择器
    bytea2numeric_v2(substring(`data`, 11 + 64, 64)) / 1e18 AS amountOutMin,
    substring((substring(`data`, 11 + 64 * 3, 64)), 25, 40) AS TO,
    bytea2numeric_v2(substring(`data`, 11 + 64 * 4, 64)) AS deadline,
    `hash`
FROM
    (
        SELECT
            `block_time`,
            `hash`,
            `data`
        FROM
            optimism.transactions
        WHERE
            `block_time` > NOW() - INTERVAL '1 days' -- 只查询最近一天的记录
            AND `to` = '0x9c12939390052919af3155f41bf4160fd3666a6f' -- Velodrome Finance: Router合约地址
            AND substring(`data`, 1, 10) = '0xf41766d8' -- swapExactTokensForTokens的函数选择器
            AND substring((substring(`data`, 11 + 64 * 6, 64)), 25, 40) = '4200000000000000000000000000000000000006' -- WETH
            AND substring((substring(`data`, 11 + 64 * 7, 64)), 25, 40) = '4200000000000000000000000000000000000042' -- OP
            AND `success` = TRUE -- 执行成功
    )
ORDER BY
    1
LIMIT
    10
```

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Ethereum_ABI/QueryRes.png)

## 事件数据查询

还是分析`swapExactTokensForTokens`这个函数调用，这次我们从事件日志的角度来查询。大多数时候都是使用事件日志查询会更加的方便与快捷。

### 1. 确定要分析的事件

一个交易或者一个函数调用中可能涉及多个事件，需要查看合约源码确定要分析的事件。

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Ethereum_ABI/SwapExactToken02.png)

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Ethereum_ABI/_swap.png)

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Ethereum_ABI/swap.png)



确定了要分析的事件后，可以在 Etherscan 上打开一笔相关交易的 logs 页面，查看下事件的签名哈希以及参数

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Ethereum_ABI/logs_swap.png)

### 2. 解析 data

因为解析的是`swap`事件，这个事件的广播是在币对的合约中，所以需要先拿到这个合约地址

OP/USDC: 0x47029bc8f5cbe3b464004e87ef9c9419a48018cd

```sql
SELECT
  `block_time`,
  `sender`,
  `receiver`,
  (`amount0In` + `amount1In`) AS amount_in,
  (`amount0Out` + `amount1Out`) AS amount_out,
  `tx_hash`
FROM
  (
    SELECT
      `block_time`,
      `tx_hash`,
      substring(`topic2`, 25, 40) AS sender, -- 地址只保留最后40个字符
      substring(`topic3`, 25, 40) AS receiver,
      bytea2numeric_v2(substring(`data`, 3, 64)) / 1e18 AS amount0In, -- 第一个参数
      bytea2numeric_v2(substring(`data`, 3 + 64, 64)) / 1e18 AS amount1In, -- 第二个参数
      bytea2numeric_v2(substring(`data`, 3 + 64 * 2, 64)) / 1e18 AS amount0Out -- 第三个参数, 
      bytea2numeric_v2(substring(`data`, 3 + 64 * 3, 64)) / 1e18 AS amount1Out -- 第四个参数
    FROM
      optimism.logs
    WHERE
      `contract_address` = '0x47029bc8f5cbe3b464004e87ef9c9419a48018cd' -- OP/USDC pair 合约
      AND `topic1` = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822' -- swap事件
      AND `block_time` >= NOW() - INTERVAL '1 day'
  )
ORDER BY
  1
LIMIT
  10
```

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Ethereum_ABI/QueryRes02.png)

# 参考

[Solidity中文文档](https://learnblockchain.cn/docs/solidity/abi-spec.html#abi)

[Mastering Chain Analytics](https://sixdegreelab.gitbook.io/mastering-chain-analytics/zhong-ji-jiao-cheng/07_common_query_samples)

[WTF学院](https://wtf.academy/solidity-advanced/Delegatecall/)

[SQL on Ethereum: How to Work With All the Data from a Transaction](https://towardsdatascience.com/sql-on-ethereum-how-to-work-with-all-the-data-from-a-transaction-103f94f902e5)

---
title: "理解Dune Analytics - Raw Table"
subtitle: "Learning Raw Tables of Dune Analytics"
date: 2023-01-22
author: "jazzlost"
published: true
headerImage: "/img/blog-bg-nightsky.jpg"
tags:
  - "Blockchain"
  - "Data Analysis"
  - "Dune Analytics"
slug: "learning-raw-table-of-dune-analytics"
---
# 前言

Dune Analystic 中提供了几类的数据表，其中Raw Tables是直接从链上抓取的没有经过聚合与分类处理的原始数据，如果要理解 Dune 的数据库结构与原始链数据关系, Raw Tables 是最好的切入点。本文通过 Mirror 的 CrowdFund 合约配合 Dune Queries 来理解他们之间的关系。

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/Dune%20Table%20Category.jpeg)

# Raw Tables

Raw Tables 主要是4个，大多数数据段都是字节码，具体字段可以参考 [Raw Tables - Dune Docs](https://dune.com/docs/reference/tables/raw/)：

1. **transactions** ：包含交易相关的数据
2. **blocks** : 包含区块相关的数据
3. **traces** : 包含合约内部调用相关的数据
4. **logs** : 包含合约事件相关数据 



一笔交易的流程大致是这样的：

1. 用户签名发送交易，交易信息进入 **transactions table**
2. 交易被节点执行，执行期间合约部署/外部调用等EVM内的原子操作信息进入 **traces table**
3. 交易被节点执行，合约内包含的事件被 emit，这些事件信息进入 **logs table**
4. 交易被打包进区块上链，区块信息进入 **blocks table**



# CrowdFund 合约

这次例子使用的是 Mirror 的 [CrowdFund](https://etherscan.io/address/0x320d83769Eb64096Ea74B686Eb586E197997f930) 合约。合约的功能是创作者在 Mirror 上创建 CrowdFund 后，支持者可以通过捐赠 ETH 来得到创作者的 ERC20 代币与 ERC721 NFT，最后创作者可以关闭合约提取合约中的的捐赠。下面会通过三个交易来进行一些链上数据分析：

1. 合约创建与部署交易
2. ETH 捐赠交易
3. 合约关闭交易

## 创建/部署 合约

创建部署合约的交易是[0x5e5ef5dd9d147028f9bc21127e3de774a80c56a2e510d95f41984e6b7af1b8db](https://etherscan.io/tx/0x5e5ef5dd9d147028f9bc21127e3de774a80c56a2e510d95f41984e6b7af1b8db)，先在 Etherscan 里面查看。Overview页面的 `From` 和 `To` 分别是合约的部署者与合约地址。

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/From_To.png)



`Input Data` 便是交易中的函数调用, 这里可以看到函数签名与 `MethedID`, 每个带函数调用的`Input Data`前八位都是函数签名的`MethodID`, 后面的部分是入参,每64位代表一个参数。

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/InputData.png)



点击 Decode Input Data 后可以看到入参的具体信息。

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/Decode%20Input%20Data.png)



## Query 01

知道了 `Input Data` 的作用后，我们可以其中的 `MethodID` 来进行一些数据查询过滤，例如查找最近一年内创建了 CrowdFund 的交易的信息。

```sql
SELECT * FROM ethereum.transactions
WHERE block_time > now() - interval '3 months'
AND data is not null
AND SUBSTRING (encode(data, 'hex'), 1, 8) = '849a3aa3'
```

`SELECT * FROM ethereum.transactions` ：取 transactions table 中的所有列

`WHERE block_time > interval '3 months` ：使用 `block_time` 字段限制查询时间在当前三个月内

`AND data is not null` ：现在`Input Data` 信息不为空，单纯的 ETH 转账不会有 `Input Data`

`AND SUBSTRING (encode(data, 'hex'), 1, 8) = '849a3aa3'` : 将`Data` 先编码有Hex，然后取前8个字符，与我们之前查看到的 `MethodID`进行比较，相同的都是调用了 `createCrowdFund` 函数的交易 



![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/Query01.png)



## Internal Txns

现在切换到 Etherscan 的 `Internal Txns ` 页面，可以看到有一条记录表示有一次合约内的调用，从`From` 和 `To` 可以看到是 **Mirror: Factory Contract** 调用了 **HNVD Token Contract**, 这个记录对应到 Dune 里面的 **traces table**。

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/Internal%20Txns.png)



那这个内部调用具体在什么地方？这个就要去到合约的 `createCrowdFund` 函数中看了，下图画圈的地方产生了一个`CREATE 0` 类型的外部调用。

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/createCrowdFund.png)

## Query 02

这次我们使用 **trace type** 的方式来查询所有创建的 **CrowdFund** 合约的信息。

```sql
SELECT tx.block_time, tx.hash AS txs, tx.from, tr.type, tr.code
FROM ethereum.transactions tx
LEFT JOIN ethereum.traces tr ON tx.hash = tr.tx_hash
WHERE tx.to = '/x15312b97389a1dc3bcaba7ae58ebbd552e606ed2'
AND tr.type = 'create'
```

`SELECT tx.block_time, tx.hash AS txs, tx.from, tr.type, tr.code`：这里的 `code` 信息是合约创建时的字节码信息

`FROM ethereum.transactions tx`：这里我们需要 transactions 的 `to` 信息来限保证只查看与 Mirror: Factory Contract 交互的交易。还需要 `hash` 信息来与 traces table 进行连接操作

`LEFT JOIN ethereum.traces tr ON tx.hash = tr.tx_hash`：一般 raw tables 之间的连接都是通过 `tx_hash` 或者 `address`

`WHERE tx.to = '/x15312b97389a1dc3bcaba7ae58ebbd552e606ed2'`：只查看与 Mirror: Factory Contract 交互的交易, 注意 Dune的查询中需要把哈希的 **0x** 开头替换为 **/x**

`AND tr.type = 'create'`：限定 **Internal Txns** 类型为 `create`。`type` 类型有 **create/call/reward/suicide**



![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/Trace02.png)



## Logs

现在切换到 Etherscan 的 ` Logs ` 页面，可以看到有四条记录。`Address` 表示发出这个事件的合约地址。`Name`表示事件的名字。`Topics` 是用来对事件进行快速检索的摘要信息，可以有四个**Topics 0** 只能是函数的签名哈希，**Topics 1 - 3**可以放入参或者其它信息，放不下的部分可以写到`Data`信息中。

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/Logs.png)



如果要查看事件的定义与广播的位置，可以点击 `Address`, 在 **Contracts** 页面使用事件 `Name` 进行搜索。从`EditionCreated ` 日志的入参也可以看出来分别创建了3种版本的 NFT。1000个单价0.1ETH, 250个单价0.3ETH, 50个单价1ETH。

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/CrowdFundDeployed.png)

![](https://raw.githubusercontent.com/jazzlost/PicBed/main/EditionCreated.png)

## Query 03

我们知道了 `ethereum.logs` 信息中的 `topic1` 是事件的哈希签名，所以只要是广播了这个事件的交易，这项信息都是一样的，所以我们可以利用 `topic1` 来查询所有 `createCrowdFund` 交易的日志信息。Logs信息十分有用，TheGraph 通过事件的广播信息来构建了他们 GraphQL 数据库。

```sql
SELECT * FROM ethereum.logs
WHERE topic1 = '/x5133bb164b64ffa4461bc0c782a5c0e71cdc9d6c6ef5aa9af84f7fd2cd966d8e'::bytea
```

`SELECT * FROM ethereum.logs` ：这里换 Logs Table 进行查询

`WHERE topic1 = '0x15312b97389a1dc3bcaba7ae58ebbd552e606ed2'::bytea`：使用 `CrowdFundDeployed` 的事件哈希进行限定，注意字符串需要转换为字节数组进行比较

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/Query03.png)

# 捐赠

对合约进行捐赠交互的交易[0xd4ce80a5ee62190c5f5d5a5a7e95ba7751c8f3ef63ea0e4b65a1abfdbbb9d1ef](https://etherscan.io/tx/0xd4ce80a5ee62190c5f5d5a5a7e95ba7751c8f3ef63ea0e4b65a1abfdbbb9d1ef)。从Etherscan可以看出 **Value** 显示用户捐赠了1ETH,  **ERC-721 Tokens Transferred** 显示用户得到了 TokenID 167的NFT，**ERC-20 Tokens Transferred** 显示用户获得了1000个 HVND 代币。这笔交易没有 **Internal Txns**, 有4个 **Logs** 信息

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/Donation.png)



## Query 04

现在我们想要从 Raw Tables 里面统计出总的捐款数。这里不能单纯使用和合约交互的交易的累计 Value 值，因为不是所有交互都是进行了捐款，而且交易也不一定成功。所以思路可以改为所有和这个合约交互的交易中，找出调用了捐款函数的，且执行成功的交易。

这个合约中涉及到捐款的函数有两个, `contribute` 和 `contributeForPodium`，可以从涉及这两个函数调用的交易的 Input Data 中查看函数签名。

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/contribute.png)

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/contributeForPodium.png)



```sql
SELECT SUM(tr.value/1e18) AS contribute_value
FROM ethereum.transactions tx
LEFT JOIN ethereum.traces tr ON tx.hash = tr.tx_hash
WHERE tx.to = '/x320d83769eb64096ea74b686eb586e197997f930'::bytea
AND tx.data is not null
AND SUBSTRING(encode(tx.data, 'hex'), 1, 8) IN ('a08f793c', 'ce4661bb')
AND tr.success
AND tr.value > 0
AND tr.call_type = 'call'
```

`SELECT SUM(tr.value/1e18) AS contribute_value`：聚合累加所有满足条件的 value 值, 注意ETH的 decimal 是1e18，需要除以才是十进制单位 

`LEFT JOIN ethereum.traces tr ON tx.hash = tr.tx_hash`：和 Query3 一样我们通过 hash 来连接 tansactions table 和 traces table

`WHERE tx.to = '/x320d83769eb64096ea74b686eb586e197997f930'::bytea`：限定查寻在与这个合约交互的交易中

`AND tx.data is not null`：data 数据不为空

`AND SUBSTRING(encode(tx.data, 'hex'), 1, 8) IN ('a08f793c', 'ce4661bb')`：和 Query01 相同，限定交易是调用了 `contribute` 或者 `contributeForPodium`函数

`AND tr.success`：函数调用需要是成功的

`AND tr.value > 0`：剔除无效捐赠

`AND tr.call_type = 'call'`：这里很重要，因为 call 与 delegatecall 会导致重复统计，所以需要限定 call 类型，这里可以是 `call`/`delegatecall`/`staticcall`

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/Query04.png)



# 关闭合约

捐赠合约的关闭交易是这个[0xe9d5fefde77d4086d0f64dd1403f9b6e8e12aac74db238ebf11252740c3f65a8](https://etherscan.io/tx/0xe9d5fefde77d4086d0f64dd1403f9b6e8e12aac74db238ebf11252740c3f65a8)。可以在Etherscan上看到关闭合约的调用者是单处的创建者，交易内通过 **Internal Tnx** 将合约内的ETH分别转移到了 **Mirror: Treasury** 和 **BLVKHVND：Multisig** 这两个合约中。同时通过 **ERC-20 Tokens Transferred **可以看到mint了1012965个 HVND 代币并发送给了调用者。Input Data 里面显示的调用函数签名是 `closeFunding`, 我们可以回到之前创建的合约中具体看下

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/closeFunding.png)



可以看到函数内逻辑是将先按比例将一部分收入发送给 Mirror 的国库地址，然后剩余部分发送给 `fundingRecipient`, 和交易上看到的信息一致。代码内还可以看到 `fundingClosed` 的事件广播，我们返回交易看一下 **Logs** 页面信息，可以看到3条logs

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/closeFunding_logs.png)

## Query 05

Query05 我们想要统计合约关闭时, 发送给调用者多少 ETH 以及 HVND 代币。重新来看一下 `FundingClosed` 这个事件，它的两个Data 信息就是我们想要查询的内容

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/FundingClosed.png)



当然另外两个事件的 `data` 信息中也有我们需要的内容，这里ETH数量不一致是因为扣除了gas fee

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/FundingClosed_transfer.png)

![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/FundingClosed_SafeReceived.png)



所以有两种方式来进行这个查询，我们这里就选择从`FundingClosed`事件的`data`来进行查询。`data`数据中每个参数占64字节，所以可以将`data`信息进行分割解析。

```sql
SELECT contract_address, 
bytea2numeric(decode(SUBSTRING(encode(data, 'hex'), 1, 64), 'hex')) / 1e18 AS amountRasied,
bytea2numeric(decode(SUBSTRING(encode(data, 'hex'), 65, 64), 'hex')) / 1e18 AS creatorAllocation
FROM ethereum.logs
WHERE topic1 = '/x352ce94da8e3109dc06c05ed84e8a0aaf9ce2c4329dfd10ad1190cf620048972'::bytea
AND contract_address = '/x320d83769eb64096ea74b686eb586e197997f930'::bytea
```

`bytea2numeric(decode(SUBSTRING(encode(data, 'hex'), 1, 64), 'hex')) / 1e18 AS amountRasied,`：这里嵌套比较多，核心是将 data 数据编码为16进制，然后截取前64个字符，然后再次把字符数组解码为16进制数据，最后转换为十进制数据。这个数据就是 `data` 中的第一个参数

`bytea2numeric(decode(SUBSTRING(encode(data, 'hex'), 65, 64), 'hex')) / 1e18 AS creatorAllocation`：截取后64个字符，解析为`data` 中的第二个参数

`WHERE topic1 = '/x352ce94da8e3109dc06c05ed84e8a0aaf9ce2c4329dfd10ad1190cf620048972'::bytea`：这里需要注意的是 Etherscan 的 topic0 对应 Dune 里面的 topic1。这里是限定只在 `FundingClosed` 这个事件内查询

`AND contract_address = '/x320d83769eb64096ea74b686eb586e197997f930'::bytea`：限定查询的合约地址



![](https://jazzlost-picbed-1300763214.cos.ap-guangzhou.myqcloud.com/Dune_Raw_Table/Query05.png)



# 参考

[SQL on Ethereum: How to Work With All the Data from a Transaction | by Andrew Hong | Towards Data Science](https://towardsdatascience.com/sql-on-ethereum-how-to-work-with-all-the-data-from-a-transaction-103f94f902e5)

[A Basic Wizard Guide to Dune SQL and Ethereum Data Analytics (substack.com)](https://web3datadegens.substack.com/p/a-basic-wizard-guide-to-dune-sql)

[Raw Tables - Dune Docs](https://dune.com/docs/reference/tables/raw/)


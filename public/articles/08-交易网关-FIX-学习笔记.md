# 08 · 交易网关 + FIX 协议 · 学习笔记

> 日期: 2026-08-18 | 对应路线图阶段 7
> 项目: `fix-gateway/`（C++17，手写 FIX 编解码 + 会话层 + 应用层网关）

---

## 一、阶段 7 要解决什么

阶段 6 用的是**私有 protobuf 协议**，只有自己的客户端能接。阶段 7 换成**行业标准 FIX 协议**，让任意 FIX 客户端都能下单到自己的撮合引擎：

1. **FIX 消息格式**：Tag=Value 文本协议怎么编解码
2. **会话层**：Logon/心跳/Logout 怎么建立、维持、关闭会话
3. **应用层网关**：NewOrderSingle → 撮合引擎 → ExecutionReport

## 二、项目结构

```
fix-gateway/
├── include/fix/
│   ├── message.hpp           # FixMessage 编解码
│   └── session.hpp           # FIX over TCP 的读写（BodyLength 定界）
└── src/
    ├── message.cpp           # Tag=Value、BodyLength、CheckSum
    ├── session.cpp           # 从字节流读完整 FIX 消息
    ├── main.cpp              # 编解码 + 篡改检测验证
    ├── server.cpp            # 网关：会话层 + 下单/撤单
    └── client.cpp            # 客户端：Logon/下单/撤单
```

复用阶段 5 的 `matching-engine`（CMake 里直接编译其源码）。

## 三、三个核心设计

### 1. FIX 消息格式（Tag=Value + 校验）

```
8=FIX.4.4|9=99|35=D|11=ORD1|55=600000.SH|54=1|40=2|44=1000|38=100|10=026|
```

- 字段用 `SOH(0x01)` 分隔（日志显示为 `|`）
- `9=BodyLength`：体长度，用于**定界**（从 9 之后到 10 之前的字节数）
- `10=CheckSum`：从 `8=` 到 `10=` 前所有字节 ASCII 值之和 mod 256，3 位补零——收端重算，对不上就拒绝（篡改/损坏检测）

### 2. 会话层（Logon / 心跳 / 序号）

- 状态机：连接 → `Logon(35=A)` 握手 → 活跃 → `Logout(35=5)` → 断开
- `Heartbeat(35=0)`：`HeartBtInt(108)` 秒无消息就发心跳，对端靠它判断连接是否存活
- **序号(34)**：每方各自维护「发出的下一条序号」和「期望收到的下一条序号」，都从 1 递增；收到序号 ≠ 期望 → 丢包/乱序

### 3. 应用层网关（FIX ↔ 引擎转换）

| FIX | 引擎 | 说明 |
|-----|------|------|
| `11` ClOrdID | `OrderId` | 客户端订单号当引擎订单号 |
| `55/54/40/44/38` | symbol/side/type/price/qty | 54: 1买2卖；40: 1市价2限价 |
| `39` OrdStatus | OrderState | 0新/1部分/2全成/4撤/8拒 |

- `NewOrderSingle(35=D)` → 引擎 `process` → `ExecutionReport(35=8)`（含 39 状态、14 累计成交量）
- `OrderCancelRequest(35=F)` 用 `41=OrigClOrdID` 指原单 → 引擎 `cancel` → `ExecutionReport`

## 四、关键决策

| 决策 | 原因 |
|------|------|
| 手写 FIX 编解码，不引库 | 协议本身简单，手写才能真正理解；且无依赖 |
| `ClOrdID` 直接当 `OrderId` | demo 简化；真实网关要维护 ClOrdID↔内部单号的映射表 |
| FIX over TCP 用 BodyLength 定界 | 这是 FIX 自身的帧定界方式（区别于阶段6的 length-prefix） |
| 价格用整数分 | 引擎内部 int64；真实 FIX 的 Price 是十进制字符串，需转最小单位避免浮点 |

## 五、踩坑记录

| 坑 | 说明 |
|----|------|
| 校验和算错导致 parse 失败 | CheckSum 覆盖「从 8= 到 10= 之前」，含 SOH；容易多算/少算一个 SOH |
| 消息定界 | FIX 靠 `9=BodyLength`，先读头拿长度、再读「长度+7」字节（体 + `10=XXX|`） |
| 序号双方独立 | 发送序号和接收序号是**两个**计数器，各自从 1 递增，不能共用 |

## 六、已知简化（后续可完善）

- **maker 的成交回报省略**：真实 FIX 里，挂单被后来订单成交时，会**主动推送**一条 ExecutionReport 给原下单方；demo 只在下单/撤单时回 ER
- **重传省略**：序号错乱时真实 FIX 发 `ResendRequest(35=2)` 要求重传；demo 只打印警告
- **心跳用假定时器**：demo 手动发心跳；真实要用定时器按 `HeartBtInt` 触发

## 七、下一步（阶段 8：账户资金模块）

- Account：总资金 `totalAmount`、冻结 `frozenAmount`、可用 `availableAmount`
- 资金变动：入金/出金
- 下单联动：买入冻结资金 → 成交扣款 → 撤单解冻
- 资金流水：每笔变动可追溯、可对账

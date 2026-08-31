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

---

## 代码附录

> 完整源码见项目目录 `fix-gateway/`，此处附核心文件。

### `fix-gateway/CMakeLists.txt`

```cmake
cmake_minimum_required(VERSION 3.16)
project(fix-gateway VERSION 0.7.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

find_package(Threads REQUIRED)

add_library(fix_core STATIC
    src/message.cpp
    src/session.cpp
)

# 复用阶段5撮合引擎                                                                                                                           
set(ME_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../matching-engine)
add_library(me_core STATIC
    ${ME_DIR}/src/order_book.cpp
    ${ME_DIR}/src/matching_engine.cpp
    ${ME_DIR}/src/event_store.cpp
)

target_include_directories(me_core PUBLIC ${ME_DIR}/include)
target_compile_options(me_core PRIVATE -Wall -Wextra -Wpedantic)

target_include_directories(fix_core PUBLIC include)
target_compile_options(fix_core PRIVATE -Wall -Wextra -Wpedantic)

add_executable(fix-demo src/main.cpp)
target_link_libraries(fix-demo PRIVATE fix_core)

add_executable(server src/server.cpp)
target_link_libraries(server PRIVATE fix_core me_core Threads::Threads)

add_executable(client src/client.cpp)
target_link_libraries(client PRIVATE fix_core Threads::Threads)
```

### `fix-gateway/include/fix/message.hpp`

```cpp
#pragma once

#include <map>
#include <string>

namespace fix
{
    // FIX 消息：Tag=Value 文本，字段间用 SOH(0x01) 分隔
    class FixMessage
    {
    public:
        static constexpr char SOH = '\x01';

        std::string get(int tag) const;
        void set(int tag, const std::string &value);
        void set(int tag, int value);
        bool has(int tag) const;

        // 编码为完整 FIX 消息（自动补 9=BodyLength 和 10=CheckSum）
        std::string encode() const;

        // 解析原始字节（含 SOH），校验 CheckSum 与 BodyLength
        bool parse(const std::string &raw);

        // 校验和：msg 是从 "8=" 到 "10=" 之前的字符串
        static int checksum(const std::string &msg);

    private:
        std::map<int, std::string> fields_;
    };

} // namespace fix```

### `fix-gateway/include/fix/session.hpp`

```cpp
#pragma once

#define ASIO_STANDALONE
#include <asio.hpp>

#include "fix/message.hpp"

namespace fix
{

    // 从 TCP 流读一条 FIX 消息（用 BodyLength 定界）
    bool readFixMessage(asio::ip::tcp::socket &sock, FixMessage &out);

    // 写一条 FIX 消息
    bool writeFixMessage(asio::ip::tcp::socket &sock, const FixMessage &msg);
} // namespace fix```

### `fix-gateway/src/client.cpp`

```cpp
#include "fix/session.hpp"

#include <iostream>

using namespace std;

static int g_seq = 1;

static const char *statusName(int s)
{
    switch (s)
    {
    case 0:
        return "New(0)";
    case 1:
        return "Partial(1)";
    case 2:
        return "Filled(2)";
    case 4:
        return "Canceled(4)";
    case 8:
        return "Rejected(8)";
    }
    return "?";
}

static void logon(asio::ip::tcp::socket &sock)
{
    fix::FixMessage m;
    m.set(8, "FIX.4.4");
    m.set(35, "A");
    m.set(49, "BUY1");
    m.set(56, "SELL1");
    m.set(34, g_seq++);
    m.set(108, 30);
    fix::writeFixMessage(sock, m);
    fix::FixMessage in;
    fix::readFixMessage(sock, in);
}

static void newOrder(asio::ip::tcp::socket &sock, const string &clOrdId,
                     const string &symbol, int side, int price, int qty)
{
    fix::FixMessage m;
    m.set(8, "FIX.4.4");
    m.set(35, "D");
    m.set(49, "BUY1");
    m.set(56, "SELL1");
    m.set(34, g_seq++);
    m.set(11, clOrdId);
    m.set(55, symbol);
    m.set(54, side); // 1=买 2=卖
    m.set(40, 2);    // 限价
    m.set(44, price);
    m.set(38, qty);
    fix::writeFixMessage(sock, m);

    fix::FixMessage er;
    fix::readFixMessage(sock, er);
    cout << "  下单 " << symbol << (side == 1 ? " 买" : " 卖")
         << " " << qty << "@" << price
         << " → 状态 " << statusName(stoi(er.get(39)))
         << " 成交 " << er.get(14);
    if (er.has(58))
        cout << " 原因: " << er.get(58);
    cout << "\n";
}

static void cancelOrder(asio::ip::tcp::socket &sock, const string &clOrdId,
                        const string &origClOrdId, const string &symbol)
{
    fix::FixMessage m;
    m.set(8, "FIX.4.4");
    m.set(35, "F");
    m.set(49, "BUY1");
    m.set(56, "SELL1");
    m.set(34, g_seq++);
    m.set(11, clOrdId);
    m.set(41, origClOrdId);
    m.set(55, symbol);
    fix::writeFixMessage(sock, m);

    fix::FixMessage er;
    fix::readFixMessage(sock, er);
    cout << "  撤单 " << symbol << " → 状态 " << statusName(stoi(er.get(39))) << "\n";
}

int main()
{
    try
    {
        asio::io_context io;
        asio::ip::tcp::socket sock(io);
        sock.connect(asio::ip::tcp::endpoint(asio::ip::address::from_string("127.0.0.1"), 9100));

        logon(sock);

        newOrder(sock, "10001", "600000.SH", 1, 1000, 1000); // 买 1000@1000 → 挂单
        newOrder(sock, "10002", "600000.SH", 2, 1000, 400);  // 卖 400@1000 → 成交
        newOrder(sock, "10003", "000001.SZ", 1, 2000, 500);  // 另一标的挂单
        cancelOrder(sock, "10004", "10001", "600000.SH");    // 撤掉第一笔买单

        sock.close();
    }
    catch (const std::exception &e)
    {
        cerr << "client error: " << e.what() << "\n";
        return 1;
    }
    return 0;
}```

### `fix-gateway/src/main.cpp`

```cpp
#include "fix/message.hpp"

#include <iostream>
#include <string>

using namespace std;

// 把 SOH 显示成 |，方便肉眼读
static string visible(const string &s)
{
    string out;
    for (char c : s)
        out += (c == fix::FixMessage::SOH) ? '|' : c;
    return out;
}

int main()
{
    // 1. 构造一条 NewOrderSingle(35=D)
    fix::FixMessage m;
    m.set(8, "FIX.4.4");
    m.set(35, "D");     // 消息类型：下单
    m.set(49, "BUY1");  // 发送方
    m.set(56, "SELL1"); // 接收方
    m.set(34, 2);       // 序号
    m.set(52, "20240101-00:00:00");
    m.set(11, "ORD10001");  // 客户端订单号
    m.set(55, "600000.SH"); // 证券代码
    m.set(54, 1);           // 1=买
    m.set(40, 2);           // 2=限价
    m.set(44, "10.00");     // 价格
    m.set(38, 100);         // 数量

    string raw = m.encode();
    cout << "编码结果:\n"
         << visible(raw) << "\n\n";

    // 2. 解析回来，验证 round-trip
    fix::FixMessage m2;
    bool ok = m2.parse(raw);
    cout << (ok ? "✅ 解析成功" : "❌ 解析失败") << "\n";
    cout << "  BodyLength(9) = " << m2.get(9) << "\n";
    cout << "  CheckSum(10)  = " << m2.get(10) << "\n";
    cout << "  ClOrdID(11)   = " << m2.get(11) << "\n";
    cout << "  Symbol(55)    = " << m2.get(55) << "\n";
    cout << "  Side(54)      = " << m2.get(54) << " (1=买)\n";
    cout << "  Price(44)     = " << m2.get(44) << "\n";
    cout << "  OrderQty(38)  = " << m2.get(38) << "\n";

    // 3. 篡改一个字节，验证 checksum 能发现
    string bad = raw;
    size_t p = bad.find("55=");
    if (p != string::npos)
        bad[p + 3] = 'X'; // 把证券代码改掉
    fix::FixMessage m3;
    cout << "\n篡改后解析: "
         << (m3.parse(bad) ? "✅（不该通过）" : "❌ 校验失败（正确）") << "\n";

    return 0;
}```

### `fix-gateway/src/message.cpp`

```cpp
#include "fix/message.hpp"

#include <cstdio>

namespace fix
{

    std::string FixMessage::get(int tag) const
    {
        auto it = fields_.find(tag);
        return it != fields_.end() ? it->second : "";
    }

    void FixMessage::set(int tag, const std::string &value)
    {
        fields_[tag] = value;
    }

    void FixMessage::set(int tag, int value)
    {
        fields_[tag] = std::to_string(value);
    }

    bool FixMessage::has(int tag) const
    {
        return fields_.count(tag) > 0;
    }

    int FixMessage::checksum(const std::string &msg)
    {
        int sum = 0;
        for (char c : msg)
            sum = (sum + static_cast<unsigned char>(c)) % 256;
        return sum;
    }

    std::string FixMessage::encode() const
    {
        // 1. body：35 必须在最前，其余按 tag 升序（跳过 8/9/10/35）
        std::string body;
        if (has(35))
            body += "35=" + get(35) + SOH;
        for (const auto &kv : fields_)
        {
            int tag = kv.first;
            if (tag == 8 || tag == 9 || tag == 10 || tag == 35)
                continue;
            body += std::to_string(tag) + "=" + kv.second + SOH;
        }

        // 2. header：8=BeginString + 9=BodyLength
        std::string begin = has(8) ? get(8) : "FIX.4.4";
        std::string head = "8=" + begin + SOH + "9=" + std::to_string(body.size()) + SOH;

        // 3. 计算 checksum，拼上 10=CheckSum
        int cs = checksum(head + body);
        char buf[8];
        std::snprintf(buf, sizeof(buf), "%03d", cs);
        return head + body + "10=" + buf + SOH;
    }

    bool FixMessage::parse(const std::string &raw)
    {
        // 1. 校验 CheckSum
        size_t pos10 = raw.find("10=");
        if (pos10 == std::string::npos)
            return false;
        int expected = std::stoi(raw.substr(pos10 + 3)); // "10=" 后 3 位
        if (checksum(raw.substr(0, pos10)) != expected)
            return false;

        // 2. 按 SOH 切字段
        fields_.clear();
        size_t start = 0;
        while (start < raw.size())
        {
            size_t end = raw.find(SOH, start);
            if (end == std::string::npos)
                break;
            std::string field = raw.substr(start, end - start);
            size_t eq = field.find('=');
            if (eq != std::string::npos)
            {
                int tag = std::stoi(field.substr(0, eq));
                fields_[tag] = field.substr(eq + 1);
            }
            start = end + 1;
        }

        // 3. 校验 BodyLength：tag 9 声明值 == 实际体长度
        size_t p9 = raw.find("9=");
        if (p9 != std::string::npos)
        {
            size_t end9 = raw.find(SOH, p9); // "9=NNN" 后的 SOH
            int actual = static_cast<int>(pos10 - end9 - 1);
            if (std::stoi(get(9)) != actual)
                return false;
        }

        return true;
    }

} // namespace fix```

### `fix-gateway/src/server.cpp`

```cpp
#include "fix/session.hpp"
#include "me/matching_engine.hpp"

#include <iostream>

using namespace std;
using namespace me;

static const char *typeName(const string &t)
{
    if (t == "A")
        return "Logon";
    if (t == "0")
        return "Heartbeat";
    if (t == "5")
        return "Logout";
    if (t == "D")
        return "NewOrderSingle";
    if (t == "F")
        return "OrderCancelRequest";
    if (t == "8")
        return "ExecutionReport";
    return t.c_str();
}

// me 状态 → FIX OrdStatus(39)
static int ordStatus(me::OrderState s)
{
    switch (s)
    {
    case me::OrderState::NEW:
        return 0;
    case me::OrderState::PARTIALLY_FILLED:
        return 1;
    case me::OrderState::FILLED:
        return 2;
    case me::OrderState::CANCELED:
        return 4;
    case me::OrderState::REJECTED:
        return 8;
    }
    return 0;
}

// NewOrderSingle(35=D) → 引擎订单
static me::Order fromFix(const fix::FixMessage &m)
{
    me::Order o;
    o.id = std::stoull(m.get(11)); // ClOrdID 当订单号
    o.symbol = m.get(55);
    o.side = (m.get(54) == "1") ? me::Side::BUY : me::Side::SELL;
    o.type = (m.get(40) == "1") ? me::OrderType::MARKET : me::OrderType::LIMIT;
    o.price = std::stoll(m.get(44));
    o.totalQty = std::stoll(m.get(38));
    return o;
}

int main()
{
    try
    {
        asio::io_context io;
        asio::ip::tcp::acceptor acc(io, asio::ip::tcp::endpoint(asio::ip::tcp::v4(), 9100));

        me::MatchingEngine engine(4); // 复用阶段5的撮合引擎
        cout << "FIX 网关监听 0.0.0.0:9100\n";

        while (true)
        {
            asio::ip::tcp::socket sock(io);
            acc.accept(sock);
            cout << "客户端已连接\n";

            int nextOutSeq = 1, expectedInSeq = 1;

            for (;;)
            {
                fix::FixMessage in;
                if (!fix::readFixMessage(sock, in))
                    break;

                int seq = in.has(34) ? std::stoi(in.get(34)) : 0;
                if (seq != expectedInSeq)
                    cout << "  ⚠️ 序号错乱\n";
                expectedInSeq = seq + 1;

                string type = in.get(35);
                cout << "  收到 " << typeName(type) << " seq=" << seq << "\n";

                fix::FixMessage out;
                out.set(8, "FIX.4.4");
                out.set(49, "SELL1");
                out.set(56, "BUY1");
                out.set(34, nextOutSeq++);

                if (type == "A")
                {
                    out.set(35, "A");
                    out.set(108, in.get(108));
                }
                else if (type == "0")
                {
                    out.set(35, "0");
                }
                else if (type == "5")
                {
                    out.set(35, "5");
                    fix::writeFixMessage(sock, out);
                    break;
                }
                else if (type == "D") // 下单
                {
                    auto r = engine.process(fromFix(in));

                    out.set(35, "8");                        // ExecutionReport
                    out.set(11, in.get(11));                 // 回显 ClOrdID
                    out.set(37, std::to_string(r.order.id)); // OrderID
                    out.set(55, r.order.symbol);
                    out.set(39, ordStatus(r.order.state));
                    out.set(14, r.order.filledQty); // CumQty
                    if (r.rejected)
                        out.set(58, r.rejectReason);
                }
                else if (type == "F") // 撤单
                {
                    uint64_t origId = std::stoull(in.get(41)); // OrigClOrdID
                    bool ok = engine.cancel(in.get(55), origId);

                    out.set(35, "8");
                    out.set(11, in.get(11));
                    out.set(37, in.get(41));
                    out.set(55, in.get(55));
                    out.set(39, ok ? 4 : 8); // 4=已撤，8=拒绝
                }
                else
                {
                    continue;
                }
                fix::writeFixMessage(sock, out);
            }
            cout << "客户端断开\n";
        }
    }
    catch (const std::exception &e)
    {
        cerr << "server error: " << e.what() << "\n";
        return 1;
    }
}```

### `fix-gateway/src/session.cpp`

```cpp
#include "fix/session.hpp"

namespace fix
{

    bool readFixMessage(asio::ip::tcp::socket &sock, FixMessage &out)
    {
        try
        {
            // 1. 逐字节读，直到读全 "9=NNN|"（拿到 BodyLength）
            std::string head;
            char c;
            while (true)
            {
                asio::read(sock, asio::buffer(&c, 1));
                head += c;
                size_t p9 = head.find("9=");
                if (p9 != std::string::npos)
                {
                    size_t end9 = head.find(FixMessage::SOH, p9);
                    if (end9 != std::string::npos)
                    {
                        int bodyLen = std::stoi(head.substr(p9 + 2, end9 - p9 - 2));
                        // 2. 再读 bodyLen + 7 字节（体 + "10=XXX|"）
                        std::string rest(bodyLen + 7, '\0');
                        asio::read(sock, asio::buffer(&rest[0], rest.size()));
                        return out.parse(head + rest);
                    }
                }
            }
        }
        catch (const std::exception &)
        {
            return false;
        }
    }

    bool writeFixMessage(asio::ip::tcp::socket &sock, const FixMessage &msg)
    {
        try
        {
            std::string raw = msg.encode();
            asio::write(sock, asio::buffer(raw));
            return true;
        }
        catch (const std::exception &)
        {
            return false;
        }
    }

} // namespace fix```


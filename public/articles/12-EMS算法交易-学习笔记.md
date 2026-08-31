# 12 · EMS 算法交易 · 学习笔记

> 日期: 2026-08-18 | 对应路线图阶段 11
> 项目: `ems/`（C++17，父子订单拆分 + TWAP/VWAP 算法）

---

## 一、阶段 11 要解决什么

大单直接砸进市场会**冲击价格**（market impact）。EMS（执行管理系统）把大单拆成小单分批执行：

1. **父单/子单**：一个父单拆成多个子单，父子状态联动
2. **TWAP**：时间加权，按时间均匀拆分
3. **VWAP**：成交量加权，按预期成交量拆分
4. **执行控制**：子单进度跟踪、父单撤单联动、未完成量回收
5. **AvgPx**：加权平均成交价

## 二、项目结构

```
ems/
├── include/ems/ems_engine.hpp   # ParentOrder/ChildOrder/Algorithm + EmsEngine
└── src/
    ├── ems_engine.cpp           # 拆分 + 状态联动 + 撤单级联
    └── main.cpp                 # TWAP / VWAP 演示
```

## 三、核心设计

### 1. 父单/子单模型

- **父单**：意图（买 1000 股），状态由子单聚合而来
- **子单**：执行切片，逐片发送到市场

```
父单(买1000股) ──拆分──> 子单1(200) 子单2(200) ... 子单5(200)
```

### 2. TWAP vs VWAP

| 算法 | 拆分方式 | 1000 股拆 5 片 |
|------|---------|---------------|
| TWAP | 时间均匀 | `[200, 200, 200, 200, 200]` |
| VWAP | 成交量加权（U 型曲线） | `[300, 150, 100, 150, 300]` |

VWAP 的核心：成交量大的时段多执行（开盘/收盘），小的时段少执行（中午）。

### 3. 状态联动 + AvgPx

- 子单成交 → 父单 `filledQty` 累加、`totalCost` 累加
- 父单状态 = 子单聚合：全部成交 → FILLED，部分 → PARTIALLY_FILLED
- `AvgPx = totalCost / filledQty`（增量计算）

### 4. 撤单级联 + 未完成量回收

撤父单 → 级联撤所有未完成子单 → 返回 `totalQty - filledQty`（未完成量回收）。

## 四、关键决策

| 决策 | 原因 |
|------|------|
| 父子分离，状态聚合 | 父单是「意图」，子单是「执行」，职责清晰 |
| AvgPx 增量累加 | O(1) 更新，避免全量重算 |
| 余数分给前几片 | 整数拆分不丢量 |
| 撤单级联回收未成交量 | 保证父单总量守恒 |

## 五、已知简化（后续可完善）

- **成交是模拟的**（`onChildFill` 直接汇报），真实要接撮合引擎，把子单真正发到市场
- **VWAP 用固定 U 型曲线**，真实用历史成交量分布（按标的、时段统计）
- **无时间调度**：真实 TWAP 要按时间间隔定时发子单，demo 里手动逐片执行

## 六、下一步（阶段 12：清算结算 + 对账 + 历史数据）

- 数据模型：订单/成交/持仓/资金流水
- 对账：内部对账 + 与"交易所"对账
- 日终清算：批量任务、事务边界
- 历史数据：成交历史、行情 K 线

---

## 代码附录

> 完整源码见项目目录 `ems/`，此处附核心文件。

### `ems/CMakeLists.txt`

```cmake
cmake_minimum_required(VERSION 3.16)
project(ems VERSION 0.11.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

set(ME_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../matching-engine)

add_library(ems_core STATIC src/ems_engine.cpp)
target_include_directories(ems_core PUBLIC include ${ME_DIR}/include)
target_compile_options(ems_core PRIVATE -Wall -Wextra -Wpedantic)

add_executable(ems-demo src/main.cpp)
target_link_libraries(ems-demo PRIVATE ems_core)
```

### `ems/include/ems_engine.hpp`

```cpp
#pragma once

#include "me/types.hpp"

#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

namespace ems
{
    using me::OrderId;
    using me::OrderState;
    using me::Price;
    using me::Quantity;
    using me::Side;
    using Amount = int64_t;

    enum class Algorithm
    {
        TWAP = 0,
        VWAP = 1
    };

    // 子单（父单拆分出的切片）
    struct ChildOrder
    {
        OrderId id = 0;
        Quantity qty = 0;
        Quantity filledQty = 0;
        OrderState state = OrderState::NEW;
    };

    // 父单（算法单）
    struct ParentOrder
    {
        OrderId id = 0;
        std::string userId;
        std::string symbol;
        Side side = Side::BUY;
        Quantity totalQty = 0;
        Quantity filledQty = 0;
        Amount totalCost = 0; // 成交金额累计（算 AvgPx 用）
        OrderState state = OrderState::NEW;
        Algorithm algo = Algorithm::TWAP;
        int totalSlices = 0;
        int sentSlices = 0;
        std::vector<ChildOrder> children;

        Price avgPx() const { return filledQty == 0 ? 0 : totalCost / filledQty; }
    };

    // EMS 引擎：父单拆分 + 状态联动
    class EmsEngine
    {
    public:
        std::shared_ptr<ParentOrder> createParent(const std::string &userId, const std::string &symbol, Side side, Quantity totalQty, Algorithm algo, int slices);

        // 拆出下一个子单；已拆完返回 nullptr
        std::shared_ptr<ChildOrder> nextSlice(OrderId parentId);

        // 子单成交回报(qty股，price价)
        void onChildFill(OrderId parentId, OrderId childId, Quantity qty, Price price);

        // 撤父单：撤所有未完成子单，返回回收的未成交量
        Quantity cancelParent(OrderId parentId);

        std::shared_ptr<ParentOrder> parent(OrderId id) const;

    private:
        std::unordered_map<OrderId, std::shared_ptr<ParentOrder>> parents_;
        OrderId nextParentId_ = 1;
        OrderId nextChildId_ = 1;
    };
} // namespace ems```

### `ems/src/ems_engine.cpp`

```cpp
#include "ems_engine.hpp"

namespace
{
    // 简化的 U 型成交量曲线：5 片固定权重（和 100），其余片数退回均分
    int vwapWeight(int i, int n)
    {
        static const int w[5] = {30, 15, 10, 15, 30};
        return (n == 5) ? w[i] : 100 / n;
    }
}

namespace ems
{
    std::shared_ptr<ParentOrder> EmsEngine::createParent(const std::string &userId, const std::string &symbol, Side side, Quantity totalQty, Algorithm algo, int slices)
    {
        if (slices <= 0 || totalQty <= 0)
            return nullptr;

        auto p = std::make_shared<ParentOrder>();
        p->id = nextParentId_++;
        p->userId = userId;
        p->symbol = symbol;
        p->side = side;
        p->totalQty = totalQty;
        p->algo = algo;
        p->totalSlices = slices;

        // 预拆分
        if (algo == Algorithm::TWAP)
        {
            Quantity base = totalQty / slices;
            Quantity rem = totalQty % slices;
            for (int i = 0; i < slices; ++i)
            {
                ChildOrder c;
                c.id = nextChildId_++;
                c.qty = base + (i < rem ? 1 : 0);
                p->children.push_back(c);
            }
        }
        else // VWAP：按成交量曲线加权
        {
            Quantity assigned = 0;
            for (int i = 0; i < slices; ++i)
            {
                ChildOrder c;
                c.id = nextChildId_++;
                c.qty = totalQty * vwapWeight(i, slices) / 100;
                p->children.push_back(c);
                assigned += c.qty;
            }
            p->children[0].qty += (totalQty - assigned); // 舍入余数
        }

        parents_[p->id] = p;
        return p;
    }

    std::shared_ptr<ChildOrder> EmsEngine::nextSlice(OrderId parentId)
    {
        auto it = parents_.find(parentId);
        if (it == parents_.end())
            return nullptr;
        auto &p = *it->second;
        if (p.sentSlices >= p.totalSlices)
            return nullptr;
        auto child = std::make_shared<ChildOrder>(p.children[p.sentSlices++]);
        return child;
    }

    void EmsEngine::onChildFill(OrderId parentId, OrderId childId, Quantity qty, Price price)
    {
        auto it = parents_.find(parentId);
        if (it == parents_.end())
            return;
        auto &p = *it->second;

        // 更新子单
        for (auto &c : p.children)
        {
            if (c.id == childId)
            {
                c.filledQty += qty;
                c.state = (c.filledQty >= c.qty) ? OrderState::FILLED : OrderState::PARTIALLY_FILLED;
                break;
            }
        }

        // 更新父单（状态联动 + AvgPx）
        p.filledQty += qty;
        p.totalCost += qty * price;
        p.state = (p.filledQty >= p.totalQty) ? OrderState::FILLED : OrderState::PARTIALLY_FILLED;
    }

    Quantity EmsEngine::cancelParent(OrderId parentId)
    {
        auto it = parents_.find(parentId);
        if (it == parents_.end())
            return 0;
        auto &p = *it->second;

        // 撤所有未完成子单
        for (auto &c : p.children)
        {
            if (c.filledQty < c.qty)
                c.state = OrderState::CANCELED;
        }

        p.state = OrderState::CANCELED;
        return p.totalQty - p.filledQty; // 回收未成交量
    }

    std::shared_ptr<ParentOrder> EmsEngine::parent(OrderId id) const
    {
        auto it = parents_.find(id);
        return it != parents_.end() ? it->second : nullptr;
    }
} // namespace ems```

### `ems/src/main.cpp`

```cpp
#include "ems_engine.hpp"

#include <iostream>

using namespace std;
using namespace ems;
using namespace me;

static const char *stateName(OrderState s)
{
    switch (s)
    {
    case OrderState::NEW:
        return "NEW";
    case OrderState::PARTIALLY_FILLED:
        return "PARTIALLY_FILLED";
    case OrderState::FILLED:
        return "FILLED";
    case OrderState::CANCELED:
        return "CANCELED";
    case OrderState::REJECTED:
        return "REJECTED";
    }
    return "?";
}

int main()
{
    EmsEngine ems;

    // 下 TWAP 父单：买 1000 股，拆 5 片
    auto p = ems.createParent("user1", "600000.SH", Side::BUY, 1000, Algorithm::TWAP, 5);
    cout << "父单#" << p->id << " TWAP 买 " << p->totalQty << " 股，" << p->totalSlices << " 片\n";

    // 逐片执行（前 3 片，模拟成交）
    struct Slice
    {
        Quantity qty;
        Price price;
    };
    Slice fills[] = {{200, 1000}, {150, 1001}, {200, 1002}};

    for (const auto &f : fills)
    {
        auto c = ems.nextSlice(p->id);
        if (!c)
            break;
        ems.onChildFill(p->id, c->id, f.qty, f.price);
        p = ems.parent(p->id);
        cout << "  子单#" << c->id << " 成交 " << f.qty << "/" << c->qty
             << " @ " << f.price
             << " → 父单成交 " << p->filledQty << "/" << p->totalQty
             << " 状态 " << stateName(p->state)
             << " 均价 " << p->avgPx() << "\n";
    }

    // 撤父单，回收未成交量
    Quantity unfilled = ems.cancelParent(p->id);
    p = ems.parent(p->id);
    cout << "撤父单 → 状态 " << stateName(p->state)
         << "，回收未成交 " << unfilled << " 股\n";

    // ============ VWAP 演示 ============
    std::cout << "\n===== VWAP 演示 =====\n";
    auto pv = ems.createParent("user1", "600000.SH", Side::BUY, 1000, Algorithm::VWAP, 5);
    std::cout << "父单#" << pv->id << " VWAP 买 1000 股，切片:";
    for (const auto &c : pv->children)
        std::cout << " " << c.qty;
    std::cout << "\n";

    // 执行第 1 片（300 全成交）+ 第 2 片（150 部分成交 100）
    auto c1 = ems.nextSlice(pv->id);
    ems.onChildFill(pv->id, c1->id, 300, 1000);
    auto c2 = ems.nextSlice(pv->id);
    ems.onChildFill(pv->id, c2->id, 100, 1001);
    pv = ems.parent(pv->id);
    std::cout << "  执行 2 片后：父单成交 " << pv->filledQty << "/" << pv->totalQty
              << " 均价 " << pv->avgPx() << "\n";

    // 撤父单：级联撤所有未完成子单，回收未成交量
    Quantity recycled = ems.cancelParent(pv->id);
    pv = ems.parent(pv->id);
    std::cout << "  撤父单 → 回收未成交 " << recycled << " 股\n";
    for (const auto &c : pv->children)
        std::cout << "    子单#" << c.id << " qty=" << c.qty
                  << " 成交=" << c.filledQty << " 状态=" << stateName(c.state) << "\n";

    return 0;
}```


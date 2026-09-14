# HTTP 网关优雅关停崩溃（terminate called without an active exception）gdb 排查记录

> 日期：2026-09-14
> 定位对象：`gts_rest`（HTTP 网关）优雅关停（SIGTERM）时崩溃
> 工具：gdb 12.1（Ubuntu 22.04）

---

## 1. 现象

对运行中的网关发 `kill -TERM`，进程不是优雅退出，而是崩溃：

- 退出码 **134**（= 128 + 6 = SIGABRT）
- 日志尾部两行关键输出：

```
graceful stop: in-flight requests drained
terminate called without an active exception
[CRITICAL] Signal caught. Terminating safely.
```

`terminate called without an active exception` 是 C++ 运行时的 `std::terminate` 被调用、且当前没有正在传播的异常时打印的——典型来源是「`noexcept` 函数（如析构）里抛异常」或「线程入口函数抛异常逃逸」。

---

## 2. 排查步骤（可复现）

### 2.1 启动 gdb 并下断点

```bash
cd /root/httpsgateway
gdb ./cmake-build-debug/gts_rest
```

```gdb
(gdb) handle SIGTERM nostop noprint pass   # SIGTERM 透传给程序，gdb 不拦
(gdb) catch throw                          # 在每一次 C++ 抛异常处断下（__cxa_throw）
(gdb) run -c /root/httpsgateway/conf/config.yaml
```

等屏幕出现 `REST gateway listening on 0.0.0.0:5500`（启动完成）。启动阶段不会断在 throw（正常）。

### 2.2 触发关停

```gdb
(gdb) signal SIGTERM   # 先 Ctrl-C 暂停程序，再带 SIGTERM 继续，触发关停逻辑
```

gdb 停在 `Catchpoint 1 (exception thrown)`。

### 2.3 拿调用栈

```gdb
(gdb) bt
```

关键帧（已精简，只保留能说明问题的）：

```
#0  __cxa_throw ()
#1  std::__throw_system_error(int) ()
#2  std::thread::join() [clone .cold] ()                       ← join 抛异常
#3  elb_health_check::HealthCheckServer::stop()  elb_health_check.cpp:189   ← stop 里调 join
#4  operator()  elb_health_check.cpp:147                       ← signals_.async_wait 回调：stop()
#7  boost::asio::detail::signal_handler<...>::do_complete      ← 信号处理器
#11 boost::asio::io_context::run()
#12 operator()  elb_health_check.cpp:150                       ← io_thread_ 的线程 lambda：io_context_.run()
#17 std::thread::_State_impl<...>::_M_run                      ← 线程入口
#18 execute_native_thread_routine
```

---

## 3. 根因

调用栈从底往上读：

1. `io_thread_`（`std::thread`）的入口 lambda 是 `io_context_.run()`（elb_health_check.cpp:150）。
2. `signals_`（`asio::signal_set`）挂在 `io_context_` 上，所以它的 `async_wait` 回调**运行在 `io_thread_` 上**。
3. SIGTERM 到来 → `signals_` 回调（elb_health_check.cpp:147）调用 `stop()`。
4. `stop()` 第 189 行调用 `io_thread_.join()` —— **在 `io_thread_` 自己这条线程里 join 自己**。
5. `std::thread::join()` 对当前线程自 join，抛 `std::system_error`（`errc::resource_deadlock_would_occur`）。
6. 异常穿过 `io_context::run()` → 线程 lambda → 线程入口，逃逸出 `std::thread` → `std::terminate`。

**一句话：`stop()` 被运行在 io 线程上的信号回调调用，却去 join io 线程自己。**

顺带还有一个连带问题：原 `stop()` 里有 `close_done_future.wait_for(200ms)` 等待关 acceptor——当 `stop()` 从 io 线程自身被调用时，这个等待会把自己阻塞 200ms，期间 `asio::post` 的关 acceptor 任务根本没机会执行（死等超时）。

---

## 4. 修复

`stop()` 只负责「请求停止」，不再 join；join 交给析构函数（运行在主线程）执行。

`src/common/elb_health_check.cpp`：

```cpp
HealthCheckServer::~HealthCheckServer() {
    stop();
    if (io_thread_.joinable()) {
        io_thread_.join();   // 主线程在这里 join，避免自 join
    }
}

void HealthCheckServer::stop() {
    if (context_.shutdown_flag.exchange(true))
        return;
    LOG_INFO("Server stopping...");

    work_guard_.reset();   // 允许 io_context::run() 返回

    // 关 acceptor 取消挂起的 accept（post 到 io 线程执行，不等待）
    asio::post(io_context_, [this]() {
        asio::error_code ec;
        health_acceptor_.close(ec);
        if (ec) LOG_ERROR("Health acceptor close error: {}", ec.message());
    });

    io_context_.stop();   // 让 run() 返回

    // 不在这里 join：signal handler 运行在 io_thread_ 上，join 会自 join 抛异常
}
```

改动要点：删掉 `close_done` promise + `wait_for(200ms)` + `io_thread_.join()`，把 join 移到析构。

---

## 5. 验证

修后重新编译，`kill -TERM` 结果：

- 退出码 **0**（干净退出）
- 日志尾部：

```
graceful stop: in-flight requests drained
signal 15, stopping...
Graceful shutdown: drain up to 10s (in_flight=0)
Server stopping...        ← ELB 健康检查正常关停
```

不再出现 `terminate called without an active exception`。

> 验证时注意：`warm_cli_order_no_mapping()` 会在启动时阻塞主线程约 60 秒（等后端），这期间主线程还没走到 `signal_ioc.run()`，SIGTERM 会被 ELB 的 signal_set 消费掉、主线程收不到，导致关停 hang（见下「顺带发现」第 2 条）。所以验证要等 warm-up 结束后（约 65s+）再 kill。

---

## 6. 顺带发现（待处理，另行跟踪）

1. **启动阶段 bind 失败未捕获**：`HealthCheckServer` 构造函数里 `asio::ip::tcp::acceptor(io_context, endpoint)` 会 open+bind+listen，若端口（5510）被占，构造函数抛 `boost::system::system_error`，而 `main()` 没接住 → `std::terminate`（另一个「terminate」，但不是关停 bug）。表现为 `bind: Address already in use` 直接崩，而不是干净报错退出。

2. **SIGTERM 在 warm-up 期间到达会 hang**：`warm_cli_order_no_mapping()` 阻塞主线程约 60s，这期间主线程还没建立自己的 `signal_ioc`，SIGTERM 只被 ELB 健康检查的 `signals_` 消费，主线程随后在 `signal_ioc.run()` 永远等一个不会再来的信号。

---

## 7. 经验总结（方法论）

1. **`terminate called without an active exception` 的两类来源**：`noexcept` 函数（析构）抛异常，或线程入口函数抛异常逃逸。前者看 `bt` 里 `std::terminate` 上方的析构帧；后者看是否有 `std::thread::_State_impl::_M_run`。
2. **`catch throw` 比 `break std::terminate` 更直接**：它能停在异常**抛出点**，直接看到是哪个函数抛的（本例直接定位到 `std::thread::join()`）。
3. **线程安全 / 生命周期铁律**：线程对象（`std::thread`）不能被它自己 join；`join()` 只能由**另一条线程**在确认线程已退出后调用。同理，`asio::io_context` 的 `stop()` 从自己的 handler 里调用是安全的，但 join 不是。
4. **信号回调所在线程要搞清楚**：`asio::signal_set` 挂在哪个 `io_context` 上，它的回调就运行在那个 `io_context` 的线程上——这决定了回调里能安全做什么（本例：回调里不能 join 自己这条线程）。
5. **排查前先清环境**：端口占用 / 残留进程会让「修好了」的假象被掩盖。本例第一次验证失败就是因为之前 gdb 会话的残留进程占着 5510 端口，掩盖了真正的关停验证。

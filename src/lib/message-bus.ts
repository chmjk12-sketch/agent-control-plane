// 内存消息总线 - 用于 Agent 间通信与协同

export interface Message {
  id: string;
  topic: string;
  payload: any;
  sender?: string;
  timestamp: number;
  correlationId?: string;
}

export interface Subscription {
  id: string;
  topic: string;
  callback: (message: Message) => void | Promise<void>;
  pattern?: boolean;
}

export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeout: NodeJS.Timeout;
}

class MessageBus {
  private subscriptions: Map<string, Subscription[]> = new Map();
  private history: Message[] = [];
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private maxHistorySize: number;
  private requestTimeoutMs: number;

  constructor(options?: { maxHistorySize?: number; requestTimeoutMs?: number }) {
    this.maxHistorySize = options?.maxHistorySize ?? 1000;
    this.requestTimeoutMs = options?.requestTimeoutMs ?? 30000;
  }

  /**
   * 发布消息到指定 topic
   */
  publish(topic: string, payload: any, sender?: string): Message {
    const message: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      topic,
      payload,
      sender,
      timestamp: Date.now(),
    };

    // 存储历史
    this.history.push(message);
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }

    // 精确匹配
    const subs = this.subscriptions.get(topic) || [];
    for (const sub of subs) {
      try {
        sub.callback(message);
      } catch (err) {
        console.error(`[MessageBus] 订阅回调异常 (${sub.id}):`, err);
      }
    }

    // 通配符匹配
    for (const [pattern, patternSubs] of this.subscriptions) {
      if (pattern === topic) continue;
      for (const sub of patternSubs) {
        if (sub.pattern && this.matchPattern(pattern, topic)) {
          try {
            sub.callback(message);
          } catch (err) {
            console.error(`[MessageBus] 通配符订阅回调异常 (${sub.id}):`, err);
          }
        }
      }
    }

    return message;
  }

  /**
   * 订阅 topic（支持通配符 *）
   */
  subscribe(topic: string, callback: (message: Message) => void | Promise<void>): () => void {
    const isPattern = topic.includes("*");
    const sub: Subscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      topic,
      callback,
      pattern: isPattern,
    };

    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, []);
    }
    this.subscriptions.get(topic)!.push(sub);

    // 返回取消订阅函数
    return () => {
      const subs = this.subscriptions.get(topic);
      if (subs) {
        const idx = subs.findIndex((s) => s.id === sub.id);
        if (idx !== -1) subs.splice(idx, 1);
        if (subs.length === 0) this.subscriptions.delete(topic);
      }
    };
  }

  /**
   * Request-Response 模式：发送请求并等待响应
   */
  async request(topic: string, payload: any, timeoutMs?: number): Promise<any> {
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const responseTopic = `${topic}.response`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`[MessageBus] 请求超时: ${topic} (${timeoutMs || this.requestTimeoutMs}ms)`));
      }, timeoutMs || this.requestTimeoutMs);

      this.pendingRequests.set(correlationId, { resolve, reject, timeout });

      // 订阅响应
      const unsub = this.subscribe(responseTopic, (msg) => {
        if (msg.correlationId === correlationId) {
          unsub();
          const pending = this.pendingRequests.get(correlationId);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(correlationId);
          }
          resolve(msg.payload);
        }
      });

      // 发送请求
      this.publish(topic, payload, undefined);
    });
  }

  /**
   * 响应 request
   */
  respond(topic: string, correlationId: string, payload: any): void {
    const responseTopic = `${topic}.response`;
    this.publish(responseTopic, payload, undefined);
    // 手动设置 correlationId（publish 不直接支持）
    const lastMsg = this.history[this.history.length - 1];
    if (lastMsg) {
      lastMsg.correlationId = correlationId;
    }
  }

  /**
   * 获取消息历史
   */
  getHistory(options?: { topic?: string; limit?: number; since?: number }): Message[] {
    let messages = [...this.history];

    if (options?.topic) {
      messages = messages.filter((m) => m.topic === options.topic);
    }
    if (options?.since) {
      messages = messages.filter((m) => m.timestamp >= options.since!);
    }
    if (options?.limit) {
      messages = messages.slice(-options.limit);
    }

    return messages;
  }

  /**
   * 获取当前订阅统计
   */
  getStats() {
    const topicCount = this.subscriptions.size;
    let subCount = 0;
    for (const subs of this.subscriptions.values()) {
      subCount += subs.length;
    }
    return {
      topicCount,
      subCount,
      historySize: this.history.length,
      pendingRequests: this.pendingRequests.size,
    };
  }

  /**
   * 清空历史和待处理请求
   */
  clear(): void {
    this.history = [];
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("MessageBus cleared"));
    }
    this.pendingRequests.clear();
  }

  private matchPattern(pattern: string, topic: string): boolean {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return regex.test(topic);
  }
}

export const messageBus = new MessageBus();

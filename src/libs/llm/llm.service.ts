import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export enum RequestPriority {
  LOW = 'low',
  NORMAL = 'normal',
  URGENT = 'urgent',
}

export interface LLMRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  priority?: RequestPriority;
  retries?: number;
  requestId?: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed: number;
  cost: number;
  model: string;
  processingTime: number;
  queueTime?: number;
  requestId?: string;
}

export interface LLMConfig {
  apiKey: string;
  routineModel: string;
  strategyModel: string;
  dailyLimit: number;
  defaultTimeout: number;
  concurrentLimit: number;
  maxQueueSize: number;
  retryAttempts: number;
  retryDelayMs: number;
}

interface QueuedRequest {
  request: LLMRequest;
  priority: RequestPriority;
  queuedAt: number;
  resolve: (response: LLMResponse) => void;
  reject: (error: Error) => void;
  retryCount: number;
  requestId: string;
}

interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageQueueTime: number;
  averageProcessingTime: number;
  currentQueueSize: number;
  activeRequests: number;
  rateLimitHits: number;
  timeoutCount: number;
}

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private readonly httpClient: AxiosInstance;
  private readonly config: LLMConfig;
  private dailySpent = 0;
  private requestCount = 0;
  private readonly resetTime = new Date();

  // Concurrent request management
  private readonly requestQueue: QueuedRequest[] = [];
  private activeRequests = 0;
  private readonly activeRequestIds = new Set<string>();

  // Metrics tracking
  private metrics: RequestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageQueueTime: 0,
    averageProcessingTime: 0,
    currentQueueSize: 0,
    activeRequests: 0,
    rateLimitHits: 0,
    timeoutCount: 0,
  };

  // Processing state
  private isProcessingQueue = false;
  private queueProcessingInterval?: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      apiKey: this.configService.get<string>('OPENROUTER_API_KEY', ''),
      routineModel: this.configService.get<string>(
        'OPENROUTER_MODEL_ROUTINE',
        'anthropic/claude-3-haiku',
      ),
      strategyModel: this.configService.get<string>(
        'OPENROUTER_MODEL_STRATEGY',
        'openai/gpt-4-turbo',
      ),
      dailyLimit: this.configService.get<number>(
        'OPENROUTER_DAILY_LIMIT',
        10.0,
      ),
      defaultTimeout: this.configService.get<number>(
        'AI_DECISION_TIMEOUT',
        30000,
      ),
      concurrentLimit: this.configService.get<number>('AI_CONCURRENT_LIMIT', 5),
      maxQueueSize: this.configService.get<number>('AI_MAX_QUEUE_SIZE', 50),
      retryAttempts: this.configService.get<number>('AI_RETRY_ATTEMPTS', 3),
      retryDelayMs: this.configService.get<number>('AI_RETRY_DELAY_MS', 1000),
    };

    this.httpClient = axios.create({
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Mafia Game AI',
      },
      timeout: this.config.defaultTimeout,
    });

    // Reset daily spending at midnight
    this.setupDailyReset();

    // Start queue processing
    this.startQueueProcessor();

    this.logger.log(
      `LLM Service initialized - Concurrent limit: ${this.config.concurrentLimit}, Max queue: ${this.config.maxQueueSize}`,
    );
  }

  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    // Generate unique request ID if not provided
    const requestId = request.requestId || this.generateRequestId();
    const requestWithId = { ...request, requestId };

    this.metrics.totalRequests++;

    // Check daily limit before queuing
    if (this.dailySpent >= this.config.dailyLimit) {
      this.metrics.failedRequests++;
      throw new Error(
        `Daily spending limit of $${this.config.dailyLimit} reached`,
      );
    }

    // Check queue capacity (backpressure handling)
    if (this.requestQueue.length >= this.config.maxQueueSize) {
      this.metrics.failedRequests++;
      throw new Error(
        `Request queue is full (${this.config.maxQueueSize} requests). Please try again later.`,
      );
    }

    const priority = request.priority || RequestPriority.NORMAL;

    return new Promise<LLMResponse>((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        request: requestWithId,
        priority,
        queuedAt: Date.now(),
        resolve,
        reject,
        retryCount: 0,
        requestId,
      };

      // Insert request based on priority
      this.insertRequestByPriority(queuedRequest);

      this.updateQueueMetrics();

      this.logger.log(
        `Request queued - ID: ${requestId}, Priority: ${priority}, Queue size: ${this.requestQueue.length}`,
      );

      // Trigger queue processing if not already running
      this.processQueue();
    });
  }

  async generateRoutineDecision(
    prompt: string,
    maxTokens = 100,
  ): Promise<LLMResponse> {
    return this.generateResponse({
      prompt,
      model: this.config.routineModel,
      maxTokens,
      temperature: 0.6,
      timeout: 15000, // Shorter timeout for routine decisions
      priority: RequestPriority.NORMAL,
    });
  }

  async generateStrategicDecision(
    prompt: string,
    maxTokens = 200,
  ): Promise<LLMResponse> {
    return this.generateResponse({
      prompt,
      model: this.config.strategyModel,
      maxTokens,
      temperature: 0.8,
      timeout: 30000, // Longer timeout for complex strategic decisions
      priority: RequestPriority.URGENT,
    });
  }

  async validateResponse(
    response: string,
    expectedFormat?: 'json' | 'text',
  ): Promise<boolean> {
    if (!response || response.trim().length === 0) {
      return false;
    }

    if (expectedFormat === 'json') {
      try {
        JSON.parse(response);
        return true;
      } catch {
        return false;
      }
    }

    // Basic text validation
    return response.trim().length > 10 && response.trim().length < 1000;
  }

  async parseDecisionResponse(response: string): Promise<{
    action: string;
    target?: string;
    reasoning?: string;
    confidence?: number;
  }> {
    try {
      // Try parsing as JSON first
      const parsed = JSON.parse(response);
      return {
        action: parsed.action || 'abstain',
        target: parsed.target,
        reasoning: parsed.reasoning || '',
        confidence: parsed.confidence || 5,
      };
    } catch {
      // Fallback to text parsing
      const lines = response
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l);

      let action = 'abstain';
      let target = undefined;
      let reasoning = '';
      let confidence = 5;

      for (const line of lines) {
        if (
          line.toLowerCase().includes('vote:') ||
          line.toLowerCase().includes('target:')
        ) {
          const match = line.match(/(?:vote|target):\s*(\w+)/i);
          if (match) {
            target = match[1];
            action = 'vote';
          }
        } else if (line.toLowerCase().includes('action:')) {
          const match = line.match(/action:\s*(\w+)/i);
          if (match) {
            action = match[1];
          }
        } else if (line.toLowerCase().includes('confidence:')) {
          const match = line.match(/confidence:\s*(\d+)/i);
          if (match) {
            confidence = Math.min(10, Math.max(1, parseInt(match[1])));
          }
        } else if (line.length > 20 && !reasoning) {
          reasoning = line;
        }
      }

      return { action, target, reasoning, confidence };
    }
  }

  getUsageStats(): {
    dailySpent: number;
    dailyLimit: number;
    requestCount: number;
    remainingBudget: number;
    metrics: RequestMetrics;
    concurrentConfig: {
      maxConcurrent: number;
      maxQueueSize: number;
      currentActive: number;
      currentQueued: number;
    };
  } {
    return {
      dailySpent: this.dailySpent,
      dailyLimit: this.config.dailyLimit,
      requestCount: this.requestCount,
      remainingBudget: Math.max(0, this.config.dailyLimit - this.dailySpent),
      metrics: { ...this.metrics },
      concurrentConfig: {
        maxConcurrent: this.config.concurrentLimit,
        maxQueueSize: this.config.maxQueueSize,
        currentActive: this.activeRequests,
        currentQueued: this.requestQueue.length,
      },
    };
  }

  // Queue management methods
  private generateRequestId(): string {
    return `llm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private insertRequestByPriority(queuedRequest: QueuedRequest): void {
    const priorityOrder = {
      [RequestPriority.URGENT]: 0,
      [RequestPriority.NORMAL]: 1,
      [RequestPriority.LOW]: 2,
    };

    let insertIndex = this.requestQueue.length;

    for (let i = 0; i < this.requestQueue.length; i++) {
      if (
        priorityOrder[queuedRequest.priority] <
        priorityOrder[this.requestQueue[i].priority]
      ) {
        insertIndex = i;
        break;
      }
    }

    this.requestQueue.splice(insertIndex, 0, queuedRequest);
  }

  private startQueueProcessor(): void {
    // Process queue every 100ms
    this.queueProcessingInterval = setInterval(() => {
      this.processQueue();
    }, 100);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // Process requests while under concurrent limit and queue has items
      while (
        this.activeRequests < this.config.concurrentLimit &&
        this.requestQueue.length > 0
      ) {
        const queuedRequest = this.requestQueue.shift();
        if (!queuedRequest) {
          break;
        }

        // Update queue metrics
        this.updateQueueMetrics();

        // Process request asynchronously
        this.processRequest(queuedRequest).catch((error) => {
          this.logger.error(
            `Unexpected error in request processing: ${error.message}`,
          );
        });
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async processRequest(queuedRequest: QueuedRequest): Promise<void> {
    const { request, queuedAt, resolve, reject, requestId } = queuedRequest;

    this.activeRequests++;
    this.activeRequestIds.add(requestId);

    const queueTime = Date.now() - queuedAt;
    const startTime = Date.now();

    try {
      this.logger.log(
        `Processing request ${requestId} - Queue time: ${queueTime}ms, Active: ${this.activeRequests}`,
      );

      const response = await this.executeRequest(request, queueTime);

      // Update success metrics
      this.metrics.successfulRequests++;
      this.updateAverageMetrics(queueTime, response.processingTime);

      resolve(response);
    } catch (error) {
      // Handle retries
      if (
        queuedRequest.retryCount < this.config.retryAttempts &&
        this.shouldRetry(error)
      ) {
        await this.retryRequest(queuedRequest, error);
      } else {
        this.metrics.failedRequests++;
        this.updateAverageMetrics(queueTime, Date.now() - startTime);

        this.logger.error(
          `Request ${requestId} failed after ${queuedRequest.retryCount} retries: ${error.message}`,
        );

        reject(error);
      }
    } finally {
      this.activeRequests--;
      this.activeRequestIds.delete(requestId);
      this.updateQueueMetrics();
    }
  }

  private async executeRequest(
    request: LLMRequest,
    queueTime: number,
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    // Check daily limit again at execution time
    if (this.dailySpent >= this.config.dailyLimit) {
      throw new Error(
        `Daily spending limit of $${this.config.dailyLimit} reached`,
      );
    }

    // Validate API key
    if (!this.config.apiKey || this.config.apiKey.includes('your_')) {
      throw new Error('OpenRouter API key not configured');
    }

    const model = request.model || this.config.routineModel;
    const maxTokens = request.maxTokens || 150;
    const temperature = request.temperature || 0.7;
    const timeout = request.timeout || this.config.defaultTimeout;

    try {
      const response = await this.httpClient.post(
        '/chat/completions',
        {
          model,
          messages: [
            {
              role: 'user',
              content: request.prompt,
            },
          ],
          max_tokens: maxTokens,
          temperature,
          stream: false,
        },
        {
          timeout,
        },
      );

      const processingTime = Date.now() - startTime;
      const content = response.data.choices?.[0]?.message?.content || '';
      const tokensUsed = response.data.usage?.total_tokens || 0;

      // Estimate cost (approximate based on model)
      const cost = this.estimateCost(model, tokensUsed);
      this.dailySpent += cost;
      this.requestCount++;

      this.logger.log(
        `Request ${request.requestId} completed - Tokens: ${tokensUsed}, Cost: $${cost.toFixed(4)}, Processing: ${processingTime}ms, Queue: ${queueTime}ms`,
      );

      return {
        content: content.trim(),
        tokensUsed,
        cost,
        model,
        processingTime,
        queueTime,
        requestId: request.requestId,
      };
    } catch (error) {
      // Handle specific error types for metrics
      if (error.code === 'ECONNABORTED') {
        this.metrics.timeoutCount++;
        throw new Error(`LLM request timeout after ${timeout}ms`);
      }

      if (error.response?.status === 429) {
        this.metrics.rateLimitHits++;
        throw new Error('Rate limit exceeded - too many requests');
      }

      if (error.response?.status === 401) {
        throw new Error('Invalid OpenRouter API key');
      }

      if (error.response?.status === 402) {
        throw new Error('Insufficient OpenRouter credits');
      }

      throw new Error(`LLM service error: ${error.message}`);
    }
  }

  private shouldRetry(error: Error): boolean {
    const retryableErrors = [
      'Rate limit exceeded',
      'timeout',
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNABORTED',
    ];

    return retryableErrors.some((retryableError) =>
      error.message.toLowerCase().includes(retryableError.toLowerCase()),
    );
  }

  private async retryRequest(
    queuedRequest: QueuedRequest,
    error: Error,
  ): Promise<void> {
    queuedRequest.retryCount++;

    const delay =
      this.config.retryDelayMs * Math.pow(2, queuedRequest.retryCount - 1); // Exponential backoff

    this.logger.warn(
      `Retrying request ${queuedRequest.requestId} (${queuedRequest.retryCount}/${this.config.retryAttempts}) after ${delay}ms - Error: ${error.message}`,
    );

    // Wait before retry
    setTimeout(() => {
      // Re-queue the request with updated retry count
      this.insertRequestByPriority(queuedRequest);
      this.updateQueueMetrics();
    }, delay);
  }

  private updateQueueMetrics(): void {
    this.metrics.currentQueueSize = this.requestQueue.length;
    this.metrics.activeRequests = this.activeRequests;
  }

  private updateAverageMetrics(
    queueTime: number,
    processingTime: number,
  ): void {
    const totalRequests =
      this.metrics.successfulRequests + this.metrics.failedRequests;

    if (totalRequests === 1) {
      this.metrics.averageQueueTime = queueTime;
      this.metrics.averageProcessingTime = processingTime;
    } else {
      // Update running averages
      this.metrics.averageQueueTime =
        (this.metrics.averageQueueTime * (totalRequests - 1) + queueTime) /
        totalRequests;

      this.metrics.averageProcessingTime =
        (this.metrics.averageProcessingTime * (totalRequests - 1) +
          processingTime) /
        totalRequests;
    }
  }

  // Public API methods for queue management
  public async clearQueue(): Promise<number> {
    const cleared = this.requestQueue.length;

    // Reject all queued requests
    this.requestQueue.forEach((queuedRequest) => {
      queuedRequest.reject(new Error('Queue cleared by administrator'));
    });

    this.requestQueue.length = 0;
    this.updateQueueMetrics();

    this.logger.warn(`Queue cleared - ${cleared} requests cancelled`);

    return cleared;
  }

  public async cancelRequest(requestId: string): Promise<boolean> {
    // Check if request is in queue
    const queueIndex = this.requestQueue.findIndex(
      (req) => req.requestId === requestId,
    );

    if (queueIndex >= 0) {
      const queuedRequest = this.requestQueue.splice(queueIndex, 1)[0];
      queuedRequest.reject(new Error('Request cancelled'));
      this.updateQueueMetrics();

      this.logger.log(`Request ${requestId} cancelled from queue`);
      return true;
    }

    // Check if request is currently active (can't cancel)
    if (this.activeRequestIds.has(requestId)) {
      this.logger.warn(`Cannot cancel active request ${requestId}`);
      return false;
    }

    return false;
  }

  public getQueueStatus(): {
    queueLength: number;
    activeRequests: number;
    priorityBreakdown: Record<RequestPriority, number>;
    oldestRequestAge: number;
  } {
    const priorityBreakdown = {
      [RequestPriority.URGENT]: 0,
      [RequestPriority.NORMAL]: 0,
      [RequestPriority.LOW]: 0,
    };

    let oldestRequestAge = 0;
    const now = Date.now();

    this.requestQueue.forEach((req) => {
      priorityBreakdown[req.priority]++;
      oldestRequestAge = Math.max(oldestRequestAge, now - req.queuedAt);
    });

    return {
      queueLength: this.requestQueue.length,
      activeRequests: this.activeRequests,
      priorityBreakdown,
      oldestRequestAge,
    };
  }

  private estimateCost(model: string, tokens: number): number {
    // Cost estimation based on OpenRouter pricing (approximate)
    const costPerKToken = this.getCostPerKToken(model);
    return (tokens / 1000) * costPerKToken;
  }

  private getCostPerKToken(model: string): number {
    // Approximate costs as of late 2024
    const costs: Record<string, number> = {
      'anthropic/claude-3-haiku': 0.00025, // $0.25 per 1K tokens
      'anthropic/claude-3-sonnet': 0.003, // $3.00 per 1K tokens
      'openai/gpt-4-turbo': 0.01, // $10.00 per 1K tokens
      'openai/gpt-3.5-turbo': 0.0015, // $1.50 per 1K tokens
      'meta-llama/llama-2-70b-chat': 0.0007, // $0.70 per 1K tokens
    };

    return costs[model] || 0.002; // Default fallback cost
  }

  private setupDailyReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      this.dailySpent = 0;
      this.requestCount = 0;
      this.resetTime.setTime(Date.now());

      this.logger.log('Daily LLM usage statistics reset');

      // Schedule next reset
      setInterval(
        () => {
          this.dailySpent = 0;
          this.requestCount = 0;
          this.resetTime.setTime(Date.now());
          this.logger.log('Daily LLM usage statistics reset');
        },
        24 * 60 * 60 * 1000,
      );
    }, msUntilMidnight);
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.generateResponse({
        prompt: 'Test connection. Respond with just "OK".',
        maxTokens: 5,
        temperature: 0,
        priority: RequestPriority.URGENT, // High priority for connection tests
      });

      return response.content.toLowerCase().includes('ok');
    } catch (error) {
      this.logger.error(`LLM connection test failed: ${error.message}`);
      return false;
    }
  }

  // Cleanup method for graceful shutdown
  public async shutdown(): Promise<void> {
    this.logger.log('Shutting down LLM service...');

    // Stop queue processor
    if (this.queueProcessingInterval) {
      clearInterval(this.queueProcessingInterval);
      this.queueProcessingInterval = undefined;
    }

    // Wait for active requests to complete (with timeout)
    const shutdownTimeout = 10000; // 10 seconds
    const startTime = Date.now();

    while (
      this.activeRequests > 0 &&
      Date.now() - startTime < shutdownTimeout
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.activeRequests > 0) {
      this.logger.warn(
        `Shutdown timeout reached with ${this.activeRequests} active requests still running`,
      );
    }

    // Cancel remaining queued requests
    const cancelledCount = await this.clearQueue();

    this.logger.log(
      `LLM service shutdown complete - ${cancelledCount} queued requests cancelled`,
    );
  }
}

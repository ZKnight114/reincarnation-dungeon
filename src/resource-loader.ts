export type ResourcePriority = 'foreground' | 'background';
export interface ResourceActivity {
  key: string;
  stage: 'loading' | 'decoding' | 'retrying' | 'ready' | 'failed';
  attempt: number;
  attempts: number;
}
export interface ResourceRetry {
  retries?: number;
  delayMs?: number;
}
export function resourceLabel(key: string) {
  if (key.startsWith('data:')) return key.startsWith('data:audio') ? '内嵌音频' : '内嵌图片';
  return key.split(/[?#]/, 1)[0].split('/').filter(Boolean).at(-1)?.slice(0, 80) ?? '游戏素材';
}
export class ResourceBatchError extends Error {
  constructor(readonly failures: { key: string; reason: unknown }[]) {
    const first = failures[0];
    const cause = first.reason instanceof Error ? first.reason.message : '加载失败';
    super(
      `${failures.length}项资源未完成：${resourceLabel(first.key)}（${cause}）。已保留完成资源，请重试。`,
    );
  }
}
interface Task<T> {
  key: string;
  priority: ResourcePriority;
  started: boolean;
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/** Shared decode queue. Background work leaves slots free for player navigation. */
export class ResourceLoader<T> {
  private ready = new Map<string, T>();
  private tasks = new Map<string, Task<T>>();
  private active = 0;
  private backgroundActive = 0;
  private observers = new Set<(activity: ResourceActivity) => void>();
  constructor(
    private load: (key: string, stage: (value: 'decoding') => void) => Promise<T>,
    private concurrency = 6,
    private backgroundConcurrency = 2,
    private retry: ResourceRetry = {},
  ) {}
  observe(observer: (activity: ResourceActivity) => void) {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
  }
  get(key: string) {
    return this.ready.get(key);
  }
  has(key: string) {
    return this.ready.has(key);
  }
  request(key: string, priority: ResourcePriority = 'foreground'): Promise<T> {
    if (this.ready.has(key)) return Promise.resolve(this.ready.get(key)!);
    const previous = this.tasks.get(key);
    if (previous) {
      if (!previous.started && priority === 'foreground') previous.priority = priority;
      this.pump();
      return previous.promise;
    }
    let resolve!: Task<T>['resolve'], reject!: Task<T>['reject'];
    const promise = new Promise<T>((ok, fail) => {
      resolve = ok;
      reject = fail;
    });
    this.tasks.set(key, { key, priority, started: false, promise, resolve, reject });
    this.pump();
    return promise;
  }
  async batch(
    keys: string[],
    progress: (done: number, total: number) => void = () => {},
    priority: ResourcePriority = 'foreground',
  ) {
    const unique = [...new Set(keys)];
    let done = unique.filter((key) => this.has(key)).length;
    progress(done, unique.length);
    const pending = unique.filter((key) => !this.has(key));
    const results = await Promise.allSettled(
      pending.map((key) => this.request(key, priority).then(() => progress(++done, unique.length))),
    );
    const failures = results.flatMap((result, index) =>
      result.status === 'rejected' ? [{ key: pending[index], reason: result.reason }] : [],
    );
    if (failures.length) throw new ResourceBatchError(failures);
  }
  private async loadTask(key: string) {
    const attempts = 1 + (this.retry.retries ?? 0);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const report = (stage: ResourceActivity['stage']) => {
        for (const observer of this.observers) {
          // Presentation errors must not turn a successful resource into a failed transfer.
          try {
            observer({ key, stage, attempt, attempts });
          } catch {}
        }
      };
      report('loading');
      try {
        const value = await this.load(key, report);
        report('ready');
        return value;
      } catch (error) {
        if (attempt === attempts) {
          report('failed');
          throw error;
        }
        report('retrying');
        await new Promise((resolve) => setTimeout(resolve, this.retry.delayMs ?? 500));
      }
    }
    throw new Error('资源未完成');
  }
  private pump() {
    while (this.active < this.concurrency) {
      const queued = [...this.tasks.values()].filter((t) => !t.started);
      const task =
        queued.find((t) => t.priority === 'foreground') ??
        (this.backgroundActive < this.backgroundConcurrency
          ? queued.find((t) => t.priority === 'background')
          : undefined);
      if (!task) return;
      task.started = true;
      const background = task.priority === 'background';
      this.active++;
      if (background) this.backgroundActive++;
      const release = () => {
        this.tasks.delete(task.key);
        this.active--;
        if (background) this.backgroundActive--;
        this.pump();
      };
      Promise.resolve()
        .then(() => this.loadTask(task.key))
        .then(
          (value) => {
            this.ready.set(task.key, value);
            release();
            task.resolve(value);
          },
          (error) => {
            release();
            task.reject(error);
          },
        );
    }
  }
}

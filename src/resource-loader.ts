export type ResourcePriority = 'foreground' | 'background';
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
  constructor(
    private load: (key: string) => Promise<T>,
    private concurrency = 6,
    private backgroundConcurrency = 2,
  ) {}
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
    let done = 0;
    progress(done, unique.length);
    const results = await Promise.allSettled(
      unique.map((key) => this.request(key, priority).then(() => progress(++done, unique.length))),
    );
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
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
        .then(() => this.load(task.key))
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

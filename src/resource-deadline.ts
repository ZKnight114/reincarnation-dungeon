/** Bound both download and decode, including APIs that ignore cancellation. */
export async function resourceDeadline<T>(
  operation: () => Promise<T>,
  milliseconds: number,
  message: string,
  cancel: () => void = () => {},
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(message));
          cancel();
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

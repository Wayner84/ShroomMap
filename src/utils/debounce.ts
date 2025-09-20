export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timeout: number | undefined;
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

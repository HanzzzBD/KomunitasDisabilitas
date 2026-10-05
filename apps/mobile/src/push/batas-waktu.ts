/** Native Firebase/HTTP tidak boleh membuat logout menunggu selamanya. */
export async function denganBatas<T>(
  kerja: (signal: AbortSignal) => Promise<T>,
  ms = 5000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const batas = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("PUSH_TIMEOUT"));
    }, ms);
  });
  try {
    return await Promise.race([kerja(controller.signal), batas]);
  } finally {
    clearTimeout(timer);
  }
}

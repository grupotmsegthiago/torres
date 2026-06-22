// Limitador de concorrência inline (substitui `p-limit`, que é ESM puro e quebra
// no bundle CJS de produção com "(0 , X.default) is not a function"). Executa no
// máximo `concurrency` tarefas em paralelo. A ordem dos resultados é definida por
// quem consome (ex.: `Promise.all(itens.map(i => limit(...)))` preserva a ordem
// dos itens por índice).
export function createLimit(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`createLimit: concurrency deve ser inteiro >= 1 (recebido: ${concurrency})`);
  }
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= concurrency) return;
    const run = queue.shift();
    if (run) { active++; run(); }
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn().then(resolve, reject).finally(() => { active--; next(); });
      });
      next();
    });
}

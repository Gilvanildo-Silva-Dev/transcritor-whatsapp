// Nenhum teste unitario pode acessar a OpenAI ou outro servidor externo por engano.
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Rede externa bloqueada nos testes. Use mocks de transporte.");
  return original(input, init);
};

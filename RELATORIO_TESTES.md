# Relatório de revisão e testes

14/11/2026 18:38:44 (Fortaleza, UTC−03:00)

## Resultado

A revisão final passou em lint, tipos, 71 testes automatizados, 30 testes de navegador, build de produção, auditoria de privacidade e auditoria npm. Não foram feitas chamadas reais à OpenAI nem utilizados áudios/transcrições pessoais nos testes.

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | Aprovado, sem avisos |
| `npm run typecheck` | Aprovado |
| `npm test` | 71 aprovados, zero falhas e zero ignorados |
| `npm run build` | Aprovado, incluindo `/api/transcribe` |
| `npm run test:e2e` | 30 aprovados no Edge; última execução em 36,1 s |
| Teste da auditoria após incluir o índice Git | 1 aprovado |
| `npm run check:privacy` | Nenhuma ocorrência encontrada |
| `npm audit --audit-level=low` | Zero vulnerabilidades |

Ambiente: Windows, Node.js v24.19.0, Next.js 16.4.6, TypeScript, SDK oficial OpenAI, Edge via Playwright. Testes de layout incluem viewport de 375 × 812.

## Funcionalidades revisadas e corrigidas

- Cópia do texto atual após edição, incluindo Unicode, emoji e múltiplas linhas; confirmação não reaparece depois de substituir o arquivo ou editar durante uma cópia pendente.
- Clipboard bloqueado ou inexistente: texto selecionado automaticamente e orientação de cópia manual.
- TXT em UTF-8 com BOM, conteúdo editado preservado e erros de criação/download tratados. A comparação do clipboard considera LF/CRLF do Windows; o TXT mantém o conteúdo conferido byte a byte.
- Texto vazio desabilita cópia/download. Texto recebido como HTML permanece texto no textarea, sem execução.
- Falhas de abertura de conexão, rede, timeout, upload interrompido, resposta vazia/malformada e erros de API liberam a interface para nova tentativa.
- Remoção e substituição cancelam envio/processamento e impedem retorno de resultados antigos.
- OPUS do WhatsApp em Ogg enviado como `audio.ogg` com os mesmos bytes, sem exigir FFmpeg desnecessariamente. OGG/Opus com MIME genérico também é reconhecido.
- Fallback para WAV feito uma única vez somente após erro específico de formato/codec/decodificação; sem ciclos de tentativas.
- WAV com silêncio digital comprovado rejeitado antes do SDK, inclusive quando surge após conversão. Gravação com amostras de amplitude mínima não é descartada como silêncio.
- Cabeçalhos truncados e inconsistentes de MP3, Ogg, WAV, M4A e WEBM tratados explicitamente.
- `.env.example` restaurado com campos vazios; `.env.local` preservado e ignorado pelo Git.
- Sete alertas de desenvolvimento resolvidos por override restrito de minimatch na cadeia do TypeScript ESLint. A instalação e a auditoria final passaram com zero vulnerabilidades.

## Cobertura automatizada

### Validação e silêncio

Os testes verificam os seis formatos, extensão em maiúsculas, MIME não confiável, extensão falsa, arquivo vazio, arquivo truncado, leitura negada, limite exato de 25 MiB, rejeição acima do limite, ID3 grande, estrutura RIFF/chunks/frames, lacing e pacote inicial Ogg, canais Opus e DocType EBML.

Silêncio digital é exercitado em PCM de 8/16/24/32 bits e float de 32/64 bits, incluindo zero negativo. Um WAV silencioso recebe 422 sem consumir a resposta inventada do mock. Resultado de conversão silencioso não gera segunda chamada ao provedor.

### Endpoint e conversão

O SDK oficial gera requisições multipart inspecionadas pelo mock: modelo `gpt-transcribe`, contexto brasileiro, indicação `pt`, JSON, conteúdo e MIME do arquivo. São cobertos campo ausente/incorreto, múltiplos arquivos, multipart inválido, corpo interrompido, limite com e sem Content-Length, chave ausente, erros 401/403/404/429/500, rede, timeout, cancelamento e respostas malformadas.

Os testes de FFmpeg usam executor controlado, com arquivos e diretórios temporários reais, e verificam a limpeza após sucesso, erro do processo, saída inválida, saída grande, cancelamento e executável inexistente. Não há gravação permanente no projeto.

### Navegador e HTTP

A suíte cobre seleção pelo explorador, arrastar/soltar, reprodução WAV, falha de codec/decodificação, substituição/remoção, concorrência de validações, progresso, processamento, sucesso, erro e nova tentativa. Exercita clipboard real e negado, edição, TXT, falha de download, timeout, cancelamento, preservação de texto e layout estreito.

As rotas HTTP reais também são verificadas com chave ausente, áudio inválido, WAV silencioso e método incorreto. Respostas de sucesso da transcrição são controladas/localizadas nos testes; não dependem da API externa.

## Privacidade e ausência de custos de API

- Runner unitário bloqueia `fetch` para rede externa; transporte do SDK é explicitamente substituído.
- Servidor E2E recebe `OPENAI_API_KEY` vazia, independentemente da configuração local; navegador usa mocks/servidor HTTP local.
- Fixtures são geradas em código. Não há mídia pessoal ou TXT de transcrição incluído como fixture.
- `.env.local`, mídias, TXT, diretórios privados e artefatos do Playwright estão ignorados.
- Auditoria inspecionou a árvore rastreada/candidatos, 32 blobs do índice Git, 55 blobs do histórico e 11 arquivos do build do navegador: nenhuma ocorrência encontrada de mídia/TXT proibido ou credenciais.
- A chave local é comparada somente em memória e não aparece no relatório, nos logs do verificador ou nos arquivos gerados. Não foi substituída nem removida.
- O escopo da auditoria é automatizado por nomes/tipos, padrões de chave e comparação com a chave local; não é classificação semântica de qualquer texto arbitrário futuro.

## Limitações verificadas

1. **OpenAI real:** não foi chamada nesta revisão, conforme solicitado. A validade da chave, os créditos, o acesso ao modelo e a qualidade de reconhecimento de fala real não foram verificados por chamadas pagas.
2. **FFmpeg real:** o executável não está disponível neste ambiente. Conversão de mídia com o binário continua dependente de instalação/configuração. OPUS em Ogg segue diretamente para o provedor; se ele recusar o codec, o fallback exige FFmpeg e explica a ausência.
3. **Silêncio:** a detecção local comprova somente silêncio digital em WAV PCM/float. Não é VAD nem identifica toda ausência de fala em arquivos comprimidos, ruído ou áudio muito baixo. Para outros formatos, uma resposta vazia da API é tratada como ausência de fala; uma hipótese incorreta do modelo não pode ser excluída pelos mocks.
4. **Cabeçalhos:** inspeção limitada não garante toda a decodificação; Ogg só reconhece Opus/Vorbis, e M4A/WEBM são validados como contêineres. Fixtures compactadas são sintéticas e não substituem uma bateria de gravações reais.
5. **Tamanho:** 25 MiB por arquivo; não há divisão automática. Um áudio comprimido pode expandir além do limite ao converter para WAV e ser rejeitado sem transcrição parcial.
6. **Navegadores e hospedagem:** automação executada no Edge/Chromium no Windows; outros navegadores e dispositivos físicos não foram executados. Clipboard depende das permissões/contexto seguro. A plataforma de hospedagem pode impor limites menores de upload/tempo.
7. **Interrupções abruptas:** `finally` cobre falhas e cancelamentos tratados. Encerramento forçado da máquina/processo antes da limpeza e falhas do sistema de arquivos não podem ser eliminados por esse mecanismo.

## Reproduzir

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run check:privacy
npm audit --audit-level=low
```

O E2E exige Edge instalado e a porta 3100 livre. Use `npm.cmd` no PowerShell quando necessário. Para operar o aplicativo fora dos testes, mantenha a chave somente em `.env.local` e configure `FFMPEG_PATH` ou o PATH do servidor quando precisar de conversão.

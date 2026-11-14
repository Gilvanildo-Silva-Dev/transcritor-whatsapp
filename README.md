# Transcritor de Áudios WhatsApp

Aplicativo web com Next.js App Router, React, TypeScript e Tailwind CSS para selecionar áudios e transcrevê-los pela API da OpenAI. A interface mantém seleção/arraste, player, texto editável, cópia e download TXT.

## Configuração

Requisitos: Node.js 20.9 ou superior, npm, uma chave da API da OpenAI com acesso ao modelo `gpt-transcribe` e FFmpeg para arquivos que precisam de conversão, especialmente `.opus`.

1. Instale as dependências:

   ```sh
   npm ci
   ```

2. Copie `.env.example` para `.env.local`. No PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   Faça a cópia somente se `.env.local` ainda não existir; preserve suas configurações anteriores.

3. Edite `.env.local` localmente:

   ```dotenv
   OPENAI_API_KEY=sua_chave_da_api
   FFMPEG_PATH=C:/ffmpeg/bin/ffmpeg.exe
   ```

   Se FFmpeg já estiver no PATH do processo Node.js, deixe `FFMPEG_PATH` vazio. No Linux, um exemplo de caminho é `/usr/bin/ffmpeg`. O executável precisa estar instalado no servidor; não basta configurar um caminho inexistente.

4. Inicie a aplicação e abra http://localhost:3000:

   ```sh
   npm run dev
   ```

   Reinicie o servidor após alterar as variáveis de ambiente. No PowerShell, use `npm.cmd` caso a política de execução bloqueie `npm.ps1`.

A chave pode ser criada no [painel da OpenAI](https://platform.openai.com/api-keys). `.env.local` está ignorado pelo Git, e `.env.example` contém somente campos vazios. Não coloque a chave no frontend nem use `NEXT_PUBLIC_`. O SDK é importado exclusivamente por módulos protegidos com `server-only`, e o cliente é criado durante o processamento da requisição; o build não precisa de credenciais.

## Fluxo e interface

1. Selecione ou arraste um arquivo. A leitura do cabeçalho e a prévia do player continuam locais, sem envio automático.
2. Clique em **Transcrever áudio**. O navegador envia um único arquivo por multipart ao endpoint do aplicativo; a interface mostra envio e progresso do upload.
3. O backend repete a validação e prepara o arquivo quando necessário. Em seguida, usa o SDK oficial para enviar o áudio à OpenAI, com modelo `gpt-transcribe`, resposta JSON, indicação de português e contexto de mensagem em português brasileiro, preservando o idioma original.
4. A interface mostra o processamento até receber `{ "text": "..." }`. O resultado pode ser revisado, editado, copiado e baixado como TXT.
5. Falhas de validação, formato, conexão, credenciais, créditos, prazo ou conversão exibem mensagens claras. A tentativa pode ser repetida; nenhum resultado fictício é usado como substituto.

Remover ou substituir o arquivo cancela a requisição em andamento e ignora respostas antigas. O cancelamento é propagado ao SDK e ao processo FFmpeg quando a conexão informa a interrupção; uma requisição que já chegou ao provedor pode ter sido processada antes do cancelamento.

O aplicativo não grava áudio permanentemente, não salva a transcrição em banco nem usa localStorage. Arquivos que não precisam de conversão ficam em memória durante a requisição. Ao transcrever, o áudio é enviado à OpenAI; a ausência de armazenamento permanente aqui se refere ao aplicativo, e não define as políticas do provedor.

## Endpoint

`POST /api/transcribe`, runtime Node.js, recebe exatamente um arquivo no campo `file`:

```sh
curl -X POST http://localhost:3000/api/transcribe -F "file=@mensagem.wav"
```

Sucesso: HTTP 200, `{ "text": "Texto transcrito..." }`.

Erro: JSON `{ "error": "Mensagem para o usuário" }`, com HTTP 400 para formulário inválido, 413 para tamanho excedido, 415 para tipo de envio incorreto, 422 para áudio inválido/sem fala, 429 para limites do provedor, 503 para configuração/acesso/FFmpeg indisponível, 504 para prazo e 502 para falha de conexão ou serviço externo. Requisições canceladas recebem 499 quando ainda é possível responder. Todas as respostas do handler usam `Cache-Control: no-store`; mensagens brutas do provedor, caminhos internos e credenciais não são devolvidos.

O limite é repetido no backend: 25 MiB (26.214.400 bytes) por arquivo, com até 64 KiB adicionais para o multipart. O corpo é contado durante a leitura mesmo sem `Content-Length`, antes de interpretar o formulário, evitando depender apenas da validação do navegador.

## Formatos e conversão

- Extensões aceitas: OGG, OPUS, MP3, M4A, WAV e WEBM, inclusive maiúsculas e nomes de exportação do WhatsApp.
- Validação da extensão, tamanho, arquivo vazio, cabeçalhos e correspondência entre contêiner e extensão. O MIME declarado pelo sistema não é usado como prova do formato.
- A inspeção de cabeçalhos não substitui decodificação completa. M4A e WEBM indicam quando só o contêiner pôde ser reconhecido. Um arquivo corrompido ainda pode ser rejeitado pelo player, pelo FFmpeg ou pela API.
- O player consulta o suporte do navegador e trata falhas de decodificação sem perder a seleção. A reprodução local não é requisito para tentar a transcrição.
- `.opus` é convertido para WAV antes de chamar a OpenAI. Os demais formatos reconhecidos são enviados diretamente. Se a API informar especificamente formato/codec incompatível ou falha de decodificação, há uma única tentativa adicional usando WAV; erros de autenticação, créditos ou serviço não disparam conversões.
- O WAV gerado usa PCM de 16 bits, mono e 16 kHz. A saída também respeita o limite de tamanho; se a conversão expandir demais o áudio, o usuário recebe orientação para dividi-lo em partes menores, sem transcrever uma saída truncada.

A camada FFmpeg cria um diretório temporário exclusivo, usa nomes fixos sem dados do usuário, executa sem shell e permite somente protocolos locais. O processo é encerrado em cancelamento/timeout e seu fechamento é aguardado antes da limpeza, inclusive no Windows. Entrada, saída parcial e diretório são removidos em `finally`, tanto após sucesso quanto após erro ou cancelamento, antes de o serviço enviar o WAV à OpenAI.

Prazos: até 120 segundos por conversão e por chamada ao SDK, 270 segundos para a operação inteira e 300 segundos de espera no navegador. A rota declara `maxDuration = 300`; configure também o limite de upload e a duração no servidor/proxy/plataforma de hospedagem, que podem impor valores menores. Conversão precisa de Node.js com permissão para executar FFmpeg e escrever no diretório temporário; não funciona em Edge Runtime.

## Verificação e testes

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run start
```

- **45 testes de validação/backend/conversão:** formatos, limite de 25 MB, MIME não confiável, multipart inválido e limitado, SDK oficial com transporte controlado, `gpt-transcribe`, contexto brasileiro, conversão/fallback, erros de API, cancelamento, timeout e limpeza real dos diretórios temporários após sucesso/falha/cancelamento.
- **19 testes no Edge:** seleção/arraste, player, substituição/remoção, validações concorrentes, layout móvel, envio multipart, progresso e processamento, resultado editável, download TXT, respostas de erro, nova tentativa e cancelamento sem reaparecimento de texto antigo. Também testam a rota HTTP real com chave ausente e áudio inválido.

`npm run test:e2e` precisa do build de produção atualizado e do Edge instalado. Inicia e encerra um servidor em `127.0.0.1:3100`; o subprocesso recebe `OPENAI_API_KEY` vazia para não usar credenciais reais nem gerar cobranças. As respostas de sucesso vêm de transporte controlado/local nos testes. Para Chrome instalado, configure `PLAYWRIGHT_CHANNEL=chrome`.

O SDK foi testado com requisições multipart reais geradas pela biblioteca, mas o transporte à OpenAI foi substituído nos testes. A execução desta etapa não fez uma transcrição cobrada: não havia `.env.local` com chave configurada nem executável FFmpeg disponível. A limpeza foi verificada com arquivos temporários reais e um executor de conversão controlado; uma conversão de mídia com o binário e uma transcrição de ponta a ponta precisam ser confirmadas após a configuração acima.

As fixtures compactadas são cabeçalhos sintéticos para validação; o player usa um WAV PCM válido. O texto de teste existe somente nos testes e nunca é um resultado fixo da aplicação.

## Organização

```text
src/
  app/api/transcribe/route.ts # POST, runtime Node.js
  app/api/health/route.ts     # GET de saúde
  components/transcription/  # Interface, upload e estados da transcrição
  components/ui/             # Card e ícones
  components/layout/         # Cabeçalho
  lib/audio/validation.ts    # Validação compartilhada
  server/audio/transcribe.ts # Multipart, OpenAI e tratamento de erros
  server/audio/conversion.ts # FFmpeg e limpeza de temporários
  server/audio/errors.ts     # Erros públicos controlados
tests/                       # Validação, conversão, SDK e navegador
```

Use `@/` para importar de `src`. O `INDEX.HTML` preexistente foi preservado e não participa das rotas Next.js. `REGISTRO.md` mantém uma nova linha por execução, com data/hora de Fortaleza e etapas realizadas, preservando o histórico anterior.

## Ambiente Windows

Se a instalação retornar `UNABLE_TO_VERIFY_LEAF_SIGNATURE` e a autoridade certificadora já for confiável no Windows, use `$env:NODE_USE_SYSTEM_CA = '1'` antes de `npm.cmd ci` com Node.js 24, sem desativar a verificação TLS.

A instalação ainda reporta sete alertas moderados na cadeia de desenvolvimento do ESLint; a tentativa anterior com `npm audit fix` não os resolveu. Consulte `npm audit` ao atualizar essas ferramentas.

Referências: [transcrição de arquivos com OpenAI](https://developers.openai.com/api/docs/guides/speech-to-text), [modelo GPT-Transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe), [SDK oficial](https://github.com/openai/openai-node) e [FFmpeg](https://ffmpeg.org/ffmpeg.html).

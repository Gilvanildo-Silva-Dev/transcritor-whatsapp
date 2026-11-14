# Transcritor de Áudios WhatsApp

Aplicativo Next.js App Router com TypeScript, React e Tailwind CSS para selecionar áudios, transcrever com a API da OpenAI, revisar o texto, copiá-lo e baixar TXT.

## Configuração e execução

Use Node.js 20.9 ou superior (Node.js 24 recomendado) e npm.

```sh
npm ci
npm run dev
```

Abra http://localhost:3000. No PowerShell, use `npm.cmd` se a política do Windows bloquear `npm.ps1`.

Se `.env.local` ainda não existir, copie `.env.example` para `.env.local`. Preserve o arquivo local caso já esteja configurado. Preencha somente no servidor:

```dotenv
OPENAI_API_KEY=sua_chave_da_api
FFMPEG_PATH=C:/ffmpeg/bin/ffmpeg.exe
```

A chave é criada no [painel da OpenAI](https://platform.openai.com/api-keys) e precisa ter acesso a `gpt-transcribe`. Reinicie o servidor após alterar o ambiente. Nunca use `NEXT_PUBLIC_` para credenciais. O SDK é utilizado exclusivamente em módulos `server-only`; o build não precisa de chave.

`FFMPEG_PATH` é opcional se o executável estiver no PATH. O FFmpeg só é necessário quando o provedor rejeita um formato/codec e o backend precisa converter para WAV. OPUS exportado pelo WhatsApp com contêiner Ogg é enviado como `audio.ogg`, mantendo os bytes e sem exigir conversão. Isso normaliza o nome de um contêiner já reconhecido, não converte um formato por simples renomeação.

## Interface e dados

- Seleção pelo explorador e arrastar/soltar um arquivo por vez, com nome, tamanho, formato e player quando suportado.
- A seleção e a prévia são locais. O envio ao servidor e à OpenAI ocorre somente ao clicar em **Transcrever áudio**.
- Estados de envio com progresso, processamento, sucesso e erro; remover ou substituir o áudio cancela a requisição e ignora respostas antigas.
- O resultado fica editável. **Copiar texto** usa o conteúdo atual; quando o clipboard é negado ou indisponível, seleciona o texto e orienta a cópia manual.
- **Baixar TXT** exporta o conteúdo atual em UTF-8 com BOM, preservando acentos, emoji e quebras de linha. Texto vazio desabilita as ações.
- Não há banco, localStorage ou armazenamento permanente de áudios/transcrições. Os temporários da conversão são apagados em `finally`, inclusive após erro ou cancelamento. As políticas da OpenAI são próprias do provedor.

## Endpoint e validação

`POST /api/transcribe` recebe exatamente um arquivo no campo `file`, por multipart/form-data. Retorna `{ "text": "..." }` ou `{ "error": "..." }`, sem cache.

```sh
curl -X POST http://localhost:3000/api/transcribe -F "file=@mensagem.ogg"
```

Formatos: OGG/Opus, OGG/Vorbis, OPUS, MP3, M4A, WAV e WEBM. Extensão, cabeçalho real, arquivo vazio e tamanho são verificados no navegador e no backend, sem confiar no MIME informado pelo sistema. O limite é 25 MiB (26.214.400 bytes), exibido como 25 MB, com até 64 KiB extras para o multipart. O corpo é contado durante a leitura, inclusive sem Content-Length.

A validação rejeita, entre outros casos, frames MP3 truncados, tabelas/pacotes Ogg incompletos, WAV com chunks/frames inconsistentes e WEBM sem DocType EBML válido. A inspeção de cabeçalhos não equivale à decodificação completa; M4A e WEBM reconhecem o contêiner, sem garantir a integridade de toda a faixa.

WAV PCM e IEEE float com silêncio digital comprovado são rejeitados antes de chamar a API, sem aplicar um limiar que descarte gravações baixas. A mesma verificação ocorre após uma conversão para WAV. Não é um detector geral de fala: ruído, áudio comprimido sem decodificação e silêncio acústico dependem da análise do provedor. Respostas vazias recebem erro de ausência de fala; respostas malformadas não viram sucesso.

A integração usa SDK oficial, modelo `gpt-transcribe`, `languages: ["pt"]` e contexto de português brasileiro, preservando o idioma original. Credenciais inválidas, ausência de configuração, falta de acesso ao modelo, limites/créditos, rede, timeout e erros de formato recebem mensagens claras, sem expor valores de chave ou mensagens internas do provedor. Upload interrompido retorna 400, tamanho excessivo 413, formato do envio incorreto 415 e áudio inválido/sem fala 422.

## Conversão e limites operacionais

Se a API rejeitar especificamente formato, codec ou decodificação, há uma única tentativa adicional com FFmpeg para WAV PCM de 16 bits, mono, 16 kHz. Erros de credenciais, créditos ou indisponibilidade não disparam conversão.

O processo usa diretório temporário exclusivo, nomes fixos, execução sem shell e somente protocolos locais. Seu fechamento é aguardado antes da limpeza dos arquivos. Saída truncada ou acima do limite é rejeitada, com orientação para dividir o áudio.

Prazos: 120 segundos por conversão/chamada do SDK, 270 segundos para a operação e 300 segundos no navegador. A rota declara `maxDuration = 300`. O ambiente de hospedagem precisa permitir o corpo da requisição e esse tempo de processamento; limites do proxy/plataforma podem ser menores. Conversão requer runtime Node.js com FFmpeg e acesso ao diretório temporário, não Edge Runtime.

## Testes e relatório

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run check:privacy
npm audit
```

A revisão final aprovou **71 testes automatizados e 30 testes no Edge**, lint, TypeScript e build. O relatório detalhado está em [RELATORIO_TESTES.md](RELATORIO_TESTES.md), incluindo a cobertura e as limitações.

Os testes de backend usam o SDK com transporte controlado. Rede externa é bloqueada pelo runner, e a suíte E2E inicia o servidor com chave vazia, sem utilizar `.env.local` para chamadas cobradas. Sucessos são simulados apenas no transporte de teste; nunca há transcrição fixa na aplicação. As fixtures são cabeçalhos/sinais sintéticos gerados em código, sem gravações pessoais.

E2E exige build atualizado e Edge instalado, usa `127.0.0.1:3100` e encerra seu servidor ao terminar. Para Chrome instalado, configure `PLAYWRIGHT_CHANNEL=chrome`. O teste de cópia confere o clipboard real e considera a normalização LF/CRLF do Windows.

## Privacidade no repositório

`.gitignore` exclui `.env.local`, mídias, TXT, diretórios de dados privados, relatórios/artefatos do Playwright e chaves de certificado. `.env.example` contém campos vazios e deve permanecer disponível.

`npm run check:privacy` verifica arquivos rastreados e candidatos, blobs do índice Git, histórico e bundles do navegador. Procura extensões privadas, padrões de chave e o valor da chave local, sem imprimir segredos. Arquivos privados existentes e ignorados permanecem no computador; o verificador não os remove nem os envia. Nenhuma chave, mídia ou transcrição privada foi acrescentada durante esta revisão.

## Organização

```text
src/app/api/transcribe/route.ts # POST, runtime Node.js
src/components/transcription/  # Upload, estados e ações de texto
src/lib/audio/validation.ts    # Cabeçalhos e limites
src/lib/audio/wav.ts           # Estrutura de WAV
src/server/audio/transcribe.ts # Multipart, SDK e erros
src/server/audio/silence.ts    # Silêncio digital comprovado
src/server/audio/conversion.ts # FFmpeg e limpeza
scripts/check-privacy.mjs      # Auditoria sem imprimir credenciais
tests/                        # Validação, endpoint, conversão e navegador
```

`REGISTRO.md` recebe uma linha por execução com data/hora de Fortaleza e etapas realizadas, preservando o histórico.

## Dependências e Windows

A cadeia de desenvolvimento do TypeScript ESLint utiliza um override restrito de minimatch para `^11.0.7`, corrigindo os alertas da versão transitiva anterior. Lint e build foram verificados com a substituição. A auditoria final do npm retornou zero vulnerabilidades; o override pode ser removido quando a dependência original incorporar a correção.

Se houver `UNABLE_TO_VERIFY_LEAF_SIGNATURE` e a autoridade certificadora já for confiável no Windows, use `$env:NODE_USE_SYSTEM_CA = '1'` com Node.js 24, sem desativar TLS.

Referências: [OpenAI — transcrição de arquivos](https://developers.openai.com/api/docs/guides/speech-to-text), [SDK oficial](https://github.com/openai/openai-node), [FFmpeg](https://ffmpeg.org/ffmpeg.html) e [correção de minimatch](https://github.com/isaacs/minimatch/releases).

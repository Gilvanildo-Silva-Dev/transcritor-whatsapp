# Transcritor de Áudios WhatsApp

Aplicativo Next.js com App Router, React, TypeScript e Tailwind CSS para preparar áudios do WhatsApp para transcrição. A integração com IA ainda não foi implementada.

## Executar

Node.js 20.9 ou superior para a aplicação; Node.js 24 para os testes unitários que executam TypeScript diretamente. Nenhuma chave de API é necessária nesta etapa.

```sh
npm ci
npm run dev
```

Abra http://localhost:3000. No PowerShell, use `npm.cmd` caso a política de execução bloqueie `npm.ps1`.

## Upload e validação local

- Seleção pelo explorador e arrastar e soltar, com um arquivo por vez.
- Extensões OGG, OPUS, MP3, M4A, WAV e WEBM, incluindo nomes de exportação do WhatsApp e extensões em maiúsculas.
- Limite de 25 MiB (26.214.400 bytes), apresentado na interface como 25 MB; arquivos vazios são rejeitados.
- A extensão é obrigatória e deve corresponder ao conteúdo reconhecido. O MIME informado pelo sistema não é usado como prova do formato.
- Inspeção de até 64 KiB do cabeçalho, com leitura pontual adicional de quatro bytes em MP3 com metadados ID3 grandes. São reconhecidos Ogg/Opus, Ogg/Vorbis, frames MP3, chunks WAV e contêineres MPEG-4 e WEBM.
- Arquivos OPUS precisam de cabeçalho Opus em contêiner Ogg. Arquivos incompatíveis com a extensão, ilegíveis, vazios ou com cabeçalho desconhecido recebem mensagens específicas.
- Em M4A e WEBM, a interface informa que reconhecer o contêiner não confirma a presença ou integridade de uma faixa de áudio. A inspeção de cabeçalhos em qualquer formato não equivale a uma decodificação completa; corrupção posterior ainda pode causar falha de reprodução.
- Remover ou substituir um arquivo cancela a validação anterior e o processamento visual pendente, limpa o texto e libera a URL local. Uma substituição inválida mantém o áudio anterior com uma mensagem explícita.
- O player usa o MIME detectado e consulta a capacidade do navegador. Sem suporte ou após erro de decodificação, exibe uma mensagem e mantém o arquivo selecionado.

Os arquivos são lidos somente no dispositivo. Não há endpoint de upload, envio de áudio, armazenamento ou conversão no navegador. O botão de transcrição continua sendo uma simulação visual sem geração de texto. É possível inserir texto manualmente para experimentar cópia e download TXT.

## Conversão futura com FFmpeg

`src/server/audio/conversion.ts` prepara `convertAudioToWav(file)` exclusivamente para o backend, protegido por `server-only`. O serviço não está conectado a nenhuma rota ou botão e não roda durante a seleção.

Quando a conversão for integrada, o ambiente precisará de runtime Node.js e do executável FFmpeg instalado no servidor, disponível no PATH ou indicado por `FFMPEG_PATH` em `.env.local` (veja `.env.example`). Não é compatível com Edge Runtime. OPUS é aceito como entrada da mesma camada, sem tratamento no navegador.

O serviço repete a validação, cria um diretório temporário exclusivo, executa FFmpeg sem shell e seleciona a primeira faixa de áudio para WAV PCM de 16 bits, mono, 16 kHz. Possui timeout de 120 segundos, limite de saída de 128 MiB, mensagens de falha e limpeza dos arquivos temporários após sucesso ou erro. Não usa nomes enviados pelo usuário para caminhos temporários.

O executável FFmpeg não estava disponível neste ambiente; a camada foi preparada e verificada pelo TypeScript, mas uma conversão real ainda precisa ser testada no servidor com FFmpeg instalado. Uma futura rota deverá revalidar a entrada no servidor e definir limites de concorrência antes de ativar conversões.

## Comandos e testes

```sh
npm run lint       # ESLint sem avisos
npm run typecheck  # TypeScript
npm test           # 18 testes de validação, Node.js 24
npm run build      # Build de produção
npm run test:e2e   # 9 testes de navegador, após o build
npm run start      # Servidor de produção, após o build
```

Os testes E2E usam o Edge instalado (`msedge`), iniciam e encerram automaticamente o servidor de produção em `127.0.0.1:3100` e verificam seleção, arraste, limites, extensões falsas, substituição, remoção, concorrência de validações, codec indisponível, falha de decodificação, processamento local, ausência de envio e layout móvel de 375 px.

Para outro navegador Chromium instalado, configure `PLAYWRIGHT_CHANNEL=chrome`; para os binários gerenciados pelo Playwright, use `PLAYWRIGHT_CHANNEL=chromium` após instalar o navegador conforme a documentação do Playwright.

As fixtures dos formatos compactados são cabeçalhos sintéticos para detecção, não gravações decodificáveis. O player é testado com um WAV PCM válido; a indisponibilidade de codec e a falha de decodificação também são testadas separadamente. O fato de reconhecer um cabeçalho não é apresentado como sucesso de reprodução.

A verificação desta etapa passou nos 18 testes unitários e nove testes E2E no Edge, além de lint, tipos e build. O endpoint `GET /api/health` permanece disponível.

## Organização

```text
src/
  app/                      # Páginas, layout e Route Handlers
  components/
    layout/                 # Cabeçalho
    ui/                     # Card e ícones reutilizáveis
    transcription/          # Interface e estados locais do upload
  lib/audio/validation.ts   # Validação compartilhável, sem APIs de servidor
  server/audio/conversion.ts # Adaptador FFmpeg exclusivo do backend
  types/                    # Espaço para contratos compartilhados
public/                     # Arquivos estáticos
tests/
  audio-fixtures.ts         # Fixtures locais
  audio-validation.test.mjs # Testes unitários
  e2e/upload.spec.ts        # Testes de navegador
```

Use `@/` para importar de `src`. Credenciais futuras devem ficar no servidor e nunca usar `NEXT_PUBLIC_`. O `INDEX.HTML` preexistente foi preservado e não participa das rotas Next.js.

## Ambiente Windows

Se a instalação retornar `UNABLE_TO_VERIFY_LEAF_SIGNATURE` e a autoridade certificadora já for confiável no Windows, execute `$env:NODE_USE_SYSTEM_CA = '1'` antes de `npm.cmd ci` com Node.js 24. Não desative a verificação TLS.

A instalação reporta sete alertas moderados na cadeia de desenvolvimento do ESLint; a tentativa anterior com `npm audit fix` não os resolveu. Consulte `npm audit` ao atualizar essas ferramentas.

Referências: [Next.js](https://nextjs.org/docs/app/getting-started/installation), [capacidade de reprodução do navegador](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canPlayType) e [documentação do FFmpeg](https://ffmpeg.org/ffmpeg.html).

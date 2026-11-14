# Transcritor de Áudios WhatsApp

Selecione seu áudio e transcreva de verdade **gratuitamente no seu computador**, usando Whisper local. A integração paga com OpenAI é uma opção separada em `/openai`.

## Temas e identificação de idioma

No cabeçalho, o seletor **Tema** oferece **Claro**, **Escuro** e **Sistema**. A opção Sistema acompanha a preferência do dispositivo. A escolha é salva no navegador e aplicada antes da primeira pintura; se o armazenamento estiver bloqueado, a troca continua funcionando na página atual. Somente a preferência de tema é persistida no localStorage, nunca áudio ou transcrição.

Após transcrever no modo local, a área de resultado mostra o **idioma detectado** e a **confiança estimada do idioma**, calculada a partir de `language_probability` retornada pelo Whisper. A detecção é automática, preservando o idioma original em vez de forçar português. O percentual não é garantia de acerto nem uma medida da precisão do texto.

O backend retorna `language.code` e `language.confidence` (probabilidade entre 0 e 1, ou `null` quando não informada). Código/score malformado é descartado ou exibido como confiança indisponível, sem inventar 100%. No modo OpenAI, mostra-se o idioma se o serviço informar um único código; não se cria percentual quando a API não o fornece.

O aplicativo não infere sexo, gênero ou identidade da pessoa a partir da voz. A análise desta etapa se limita ao idioma.
## Usar gratuitamente

Neste computador o ambiente Python e o modelo já foram instalados. Abra o terminal na pasta do projeto e execute:

```powershell
npm.cmd run dev
```

Acesse **http://localhost:3000**, clique em **Selecionar arquivo**, escolha seu áudio e clique em **Transcrever áudio**. Você pode ouvir a prévia, editar o resultado, copiar e baixar TXT. A página inicial usa somente o motor local: não precisa de chave e não consome créditos de API.

A execução acontece no computador que roda o servidor do aplicativo. Com `localhost`, é o próprio computador. A gravação é temporária e apagada após o processamento, inclusive em erro/cancelamento. O áudio nunca é enviado à OpenAI pelo modo gratuito.

## Instalar em outro computador

Requisitos: Node.js 24 recomendado, Python 3.11 ou superior compatível com as dependências binárias e espaço para o ambiente/modelo.

```sh
npm ci
npm run setup:local
npm run dev
```

`setup:local` cria `.venv`, instala faster-whisper e PyAV e baixa os pesos públicos do Whisper base (aproximadamente 145 MB, além das dependências). Esse download exige internet somente na configuração. Não exige conta, chave da OpenAI ou token Hugging Face. O binário do modelo é conferido por tamanho e SHA-256; o arquivo final só é criado após download íntegro.

A inferência usa CPU, int8, detecção automática de idioma e filtro de atividade de voz (VAD). `HF_HUB_OFFLINE` e `local_files_only` impedem downloads pelo motor durante a transcrição. Os pesos ficam em `.local-models/whisper-base`; ambiente e modelos estão fora do Git e não são empacotados automaticamente pelo Next.js.

A versão PyAV 18.1.0 está fixada porque PyAV 19 removeu um parâmetro ainda utilizado por faster-whisper 1.2.1. As bibliotecas de decodificação vêm com PyAV: o modo local não exige instalar o executável FFmpeg separadamente para OGG/OPUS.

O processamento pode ser mais lento em computadores modestos. Há limite de um áudio por vez e até 14 minutos por processamento local; o navegador espera até 15 minutos. Áudios longos podem precisar ser divididos. O modelo base pode errar palavras, principalmente com ruído: revise o texto antes de utilizá-lo.

## Modo OpenAI opcional

Acesse `http://localhost:3000/openai` somente se quiser usar a API paga. A opção está identificada na interface e nunca é usada como fallback automático do motor gratuito.

Se `.env.local` ainda não existir, copie `.env.example`; preserve a configuração existente. Defina a chave somente no servidor:

```dotenv
OPENAI_API_KEY=sua_chave_da_api
FFMPEG_PATH=C:/ffmpeg/bin/ffmpeg.exe
```

O modelo é `gpt-transcribe`, pelo SDK oficial. Reinicie o servidor após alterar o ambiente. Nunca use `NEXT_PUBLIC_` para credenciais.

`FFMPEG_PATH` só é necessário no modo OpenAI se houver uma rejeição de formato/codec que exija conversão para WAV; pode ficar vazio quando FFmpeg já estiver no PATH. OPUS em Ogg é enviado como `audio.ogg`, mantendo os bytes. A conversão de fallback é feita uma única vez, com limpeza em `finally`.

O subprocesso de transcrição gratuita não recebe `OPENAI_API_KEY`. Falhas do motor local exibem erro de configuração/processamento, sem mudar silenciosamente para a API paga.

## Configuração local opcional

Os caminhos padrão funcionam sem preencher variáveis. Para um ambiente personalizado, configure `.env.local`:

```dotenv
LOCAL_PYTHON_PATH=
LOCAL_MODEL_PATH=
```

`setup:local` e o servidor leem esses caminhos. `LOCAL_MODEL_PATH` deve apontar para um diretório com os arquivos do Whisper base, não para um identificador remoto de modelo. Em instalação personalizada, provisione scripts, Python e pesos junto ao servidor; eles não fazem parte de um pacote standalone automático.

## Upload, texto e privacidade

- Seleção e arrastar/soltar de OGG, OPUS, MP3, M4A, WAV e WEBM, um arquivo por vez, até 25 MiB (26.214.400 bytes), exibidos como 25 MB.
- Validação de extensão/cabeçalho/tamanho no navegador e backend. Arquivos vazios, truncados e extensões falsas recebem mensagens claras.
- Prévia local quando o navegador suporta o codec. Falha do player não impede tentar transcrição local.
- Remover/substituir cancela o processamento e impede resultados antigos de reaparecer.
- Cópia do texto editado, seleção manual se o clipboard for negado e TXT UTF-8 com BOM. Nenhum texto fictício é um resultado permanente.
- Silêncio digital WAV comprovado é rejeitado antes do motor. O motor local usa VAD para reduzir transcrições sem fala; respostas sem texto retornam erro claro.
- Nenhum áudio/transcrição é gravado permanentemente pelo aplicativo. O backend limpa temporários após sucesso/erro/cancelamento.
- `.env.local`, mídias, TXT, `.venv`, modelos, caches e artefatos de teste estão ignorados. A auditoria procura credenciais e arquivos proibidos em candidatos, índice, histórico e bundles, sem imprimir a chave.

## Endpoints

| Rota | Uso |
| --- | --- |
| `POST /api/transcribe/local` | Whisper CPU gratuito, sem OpenAI |
| `POST /api/transcribe` | SDK OpenAI, API paga com chave |
| `GET /api/health` | Saúde da aplicação |

As duas rotas recebem exatamente um arquivo no campo multipart `file`. Retornam `{ "text": "..." }` ou `{ "error": "..." }`, com `Cache-Control: no-store`. O retorno local também informa `engine: "local"`.

A validação multipart é compartilhada e limita a leitura mesmo sem Content-Length. Erros de arquivo, rede, configuração, timeout e modelo são tratados. Não há envio a serviços externos pelo fluxo local. Para hospedar em outro lugar, é necessário um servidor Node.js com Python/modelo, CPU/memória e permissão para subprocessos; Edge Runtime não é compatível.

## Testes

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:local
npm run check:privacy
npm audit
```

A suíte de 89 testes automatizados usa mocks e bloqueia rede externa. Os 42 testes no Edge cobrem seleção, upload, ambos os modos, edição/cópia/TXT, erros e cancelamento. O servidor E2E recebe chave vazia para impedir cobrança acidental.

`test:local` é uma verificação adicional de inferência real gratuita: gera fala sintética portuguesa e inglesa com as vozes Maria e Zira do Windows, codifica WAV/OPUS, usa o modelo instalado e testa um OPUS silencioso com VAD, além dos códigos de idioma e das probabilidades reais do modelo. Não usa gravações pessoais nem API. Limpa todos os áudios gerados ao terminar. Esse teste requer Windows com essas vozes e `setup:local` já concluído; o aplicativo não depende de SAPI para transcrever arquivos do usuário.

O relatório detalhado está em [RELATORIO_TESTES.md](RELATORIO_TESTES.md). `REGISTRO.md` preserva uma linha por execução, com data/hora de Fortaleza e etapas.

## Referências

- [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- [Modelo Whisper base convertido](https://huggingface.co/Systran/faster-whisper-base)
- [API de transcrição OpenAI](https://developers.openai.com/api/docs/guides/speech-to-text)

O override restrito de minimatch na cadeia de lint corrige os alertas transitivos anteriores. A auditoria npm retornou zero vulnerabilidades na revisão anterior; verifique novamente ao atualizar dependências.


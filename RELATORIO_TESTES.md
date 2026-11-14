# Relatório de testes — transcrição gratuita local

14/11/2026 19:16:49 (Fortaleza, UTC−03:00)

## Resultado

O aplicativo agora permite selecionar um áudio e obter transcrição real gratuitamente com Whisper base executado na CPU local. A página inicial `/` usa o motor gratuito; `/openai` preserva a opção paga, explicitamente identificada. Não há fallback automático para a API paga.

O ambiente Python e os pesos foram instalados neste computador. A inferência real reconheceu fala sintética portuguesa em WAV e OPUS/Ogg, com 184 caracteres de resultado em cada caso. Um OPUS silencioso foi rejeitado como ausência de fala pelo VAD real. Nenhuma chamada paga da OpenAI foi feita e nenhuma gravação pessoal foi utilizada.

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | Aprovado, sem avisos |
| `npm run typecheck` | Aprovado |
| `npm test` | 82 aprovados, zero falhas |
| `npm run test:local` | WAV com fala, OPUS com fala e OPUS silencioso aprovados com modelo real |
| `npm run build` | Aprovado, sem alerta de rastreamento dinâmico |
| `npm run test:e2e` | 34 aprovados no Edge |
| Rastreamento do backend local | Zero arquivos de `.venv`, `.local-models` ou `.env.local` incluídos no pacote |

## Instalação verificada

- Windows, Node.js v24.19.0 e Python 3.14.7.
- faster-whisper 1.2.1, CTranslate2 4.9.0, PyAV 18.1.0 e onnxruntime 1.32.0.
- Modelo público `Systran/faster-whisper-base`, CPU int8 e até quatro threads.
- Download de `model.bin` conferido por tamanho (145.217.532 bytes) e SHA-256.
- PyAV 19 apresentou incompatibilidade com `metadata_errors` no faster-whisper; a versão compatível 18.1.0 foi fixada e testada.
- O download HTTP inicial que ficou parado foi substituído por download pelo Node com certificados do sistema, gravação parcial e verificação de integridade, sem desativar TLS.

## Fluxo gratuito

1. Usuário seleciona ou arrasta um áudio na página inicial.
2. Extensão, cabeçalho e limite de 25 MiB são validados localmente e no backend.
3. O navegador envia somente ao servidor do aplicativo, em `POST /api/transcribe/local`.
4. O backend cria um arquivo temporário e executa o Python com pesos locais, sem receber a chave da OpenAI.
5. Whisper transcreve em português, com VAD e sem downloads durante a inferência.
6. O resultado real aparece no campo editável; cópia e TXT usam o texto revisado.
7. O processo termina e o arquivo/diretório temporário são apagados, inclusive em erro/cancelamento tratado.

O aplicativo aceita apenas uma inferência local por vez para limitar o uso de CPU/memória. A ocupação é liberada após conclusão, falha ou cancelamento.

## Cobertura

Os 82 testes automatizados incluem formatos e cabeçalhos, limite de tamanho, MIME não confiável, multipart limitado com/sem Content-Length, silêncio digital PCM/float, API OpenAI com transporte mockado, erros de rede/API, timeout, cancelamento, concorrência do motor local e limpeza de temporários de ambos os motores.

Os 34 testes de navegador incluem seleção pelo explorador, arraste, OPUS sem prévia, roteamento para o motor gratuito sem chamada à rota paga, navegação explícita entre modos, erros de configuração local, reprodução, edição, clipboard real/bloqueado, UTF-8/TXT, falhas de carregamento, nova tentativa, cancelamento e layout estreito.

O teste adicional `test:local` é diferente dos mocks: usa o modelo efetivamente instalado. Ele gera fala artificial com a voz Maria do Windows, codifica OPUS com PyAV, passa WAV e OPUS pelo handler real e verifica um OPUS silencioso. Os arquivos sintéticos são temporários e apagados no fim. Não há resultado fictício fixo na aplicação.

## Privacidade e custos

- O modo gratuito não importa o SDK OpenAI nem consulta `OPENAI_API_KEY`; a chave é removida do ambiente do subprocesso Python.
- O Python recebe `HF_HUB_OFFLINE=1`, usa `local_files_only=True` e tem telemetria do Hub desativada. O download do modelo ocorre no comando de configuração, sem áudio do usuário.
- A chave local existente foi preservada, sem ser impressa nem copiada para os arquivos gerados.
- `.venv`, `.local-models`, `.local-cache`, áudios, TXT e arquivos de ambiente estão ignorados. A auditoria também rejeita pesos binários no Git.
- Pesos, ambiente Python e `.env` foram excluídos explicitamente do rastreamento de distribuição do Next.js; os modelos precisam ser provisionados no servidor, não entram automaticamente no bundle.
- A suíte normal bloqueia rede externa e o servidor E2E recebe chave vazia. Os testes de sucesso de API paga são mocks; os testes reais gratuitos usam apenas CPU e arquivos locais.
- O comando `npm run check:privacy` verifica candidatos, índice, histórico e bundles sem exibir valores de credenciais.

## Limitações

1. O modelo base pode errar com ruído, nomes próprios e gravações difíceis. A interface permite revisar o resultado. Português é o idioma configurado nesta etapa.
2. A velocidade depende da CPU; o modelo é carregado em cada processo. Há limite de um áudio por vez, até 14 minutos no backend local e 15 minutos no navegador.
3. O download inicial precisa de internet e espaço para pesos/dependências. Depois da configuração, a inferência não precisa da API nem de internet.
4. O teste de fala artificial usa Windows com a voz Maria. Esse requisito é só do teste; transcrever arquivos do usuário não depende dessa voz. Outras plataformas não foram executadas neste ambiente.
5. O VAD reduz respostas sem fala, mas não garante ausência absoluta de erros do modelo com todos os tipos de ruído.
6. Cabeçalhos reconhecidos não garantem integridade de toda a mídia. WAV/OPUS foram testados com decodificação e inferência reais; os demais formatos mantêm validação automatizada e suporte pelo PyAV.
7. A opção OpenAI permanece paga, com chave própria, e não foi chamada ao vivo nesta revisão. Seu fallback com executável FFmpeg externo continua dependente de instalação separada; o motor gratuito decodifica com as bibliotecas do PyAV.
8. Implantação precisa de Node.js, Python, pesos, subprocessos e recursos de CPU/memória. Edge Runtime não é compatível. Quando hospedado remotamente, a inferência ocorre no computador do servidor, não no navegador do visitante.
9. Limpeza em `finally` cobre erros tratados. Queda da máquina/processo ou falha do sistema de arquivos pode impedir a limpeza normal.
10. A auditoria de privacidade verifica padrões/tipos e a chave local; não classifica semanticamente qualquer documento arbitrário futuro.

## Como usar agora

```powershell
npm.cmd run dev
```

Abra http://localhost:3000, clique em **Selecionar arquivo**, escolha o áudio e clique em **Transcrever áudio**. Neste computador a instalação do motor/modelo já foi concluída.

Para uma instalação nova: `npm ci`, `npm run setup:local`, `npm run dev`. Os detalhes e as configurações opcionais estão no README.

# Relatório de testes — transcrição gratuita local

14/11/2026 19:16:49 (Fortaleza, UTC−03:00)

## Resultado

O aplicativo agora permite selecionar um áudio e obter transcrição real gratuitamente com Whisper base executado na CPU local. A página inicial `/` usa o motor gratuito; `/openai` preserva a opção paga, explicitamente identificada. Não há fallback automático para a API paga.

O ambiente Python e os pesos foram instalados neste computador. A inferência real reconheceu fala sintética portuguesa em WAV e OPUS/Ogg, com 184 caracteres de resultado em cada caso. Um OPUS silencioso foi rejeitado como ausência de fala pelo VAD real. Nenhuma chamada paga da OpenAI foi feita e nenhuma gravação pessoal foi utilizada.

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | Aprovado, sem avisos |
| `npm run typecheck` | Aprovado |
| `npm test` | 89 aprovados, zero falhas |
| `npm run test:local` | WAV/OPUS em português, WAV em inglês e OPUS silencioso aprovados; idioma/probabilidade reais verificados |
| `npm run build` | Aprovado, sem alerta de rastreamento dinâmico |
| `npm run test:e2e` | 42 aprovados no Edge |
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
5. Whisper detecta o idioma automaticamente, transcreve no idioma original e retorna sua probabilidade, com VAD e sem downloads durante a inferência.
6. O resultado real aparece no campo editável; cópia e TXT usam o texto revisado.
7. O processo termina e o arquivo/diretório temporário são apagados, inclusive em erro/cancelamento tratado.

O aplicativo aceita apenas uma inferência local por vez para limitar o uso de CPU/memória. A ocupação é liberada após conclusão, falha ou cancelamento.

## Cobertura

Os 89 testes automatizados incluem formatos e cabeçalhos, limite de tamanho, MIME não confiável, multipart limitado com/sem Content-Length, silêncio digital PCM/float, API OpenAI com transporte mockado, erros de rede/API, timeout, cancelamento, concorrência do motor local e limpeza de temporários de ambos os motores.

Os 42 testes de navegador incluem seleção pelo explorador, arraste, OPUS sem prévia, roteamento para o motor gratuito sem chamada à rota paga, navegação explícita entre modos, erros de configuração local, reprodução, edição, clipboard real/bloqueado, UTF-8/TXT, falhas de carregamento, nova tentativa, cancelamento e layout estreito.

O teste adicional `test:local` é diferente dos mocks: usa o modelo efetivamente instalado. Ele gera fala artificial com as vozes Maria e Zira do Windows, codifica OPUS com PyAV, passa WAV e OPUS pelo handler real e verifica um OPUS silencioso. Os arquivos sintéticos são temporários e apagados no fim. Não há resultado fictício fixo na aplicação.

## Privacidade e custos

- O modo gratuito não importa o SDK OpenAI nem consulta `OPENAI_API_KEY`; a chave é removida do ambiente do subprocesso Python.
- O Python recebe `HF_HUB_OFFLINE=1`, usa `local_files_only=True` e tem telemetria do Hub desativada. O download do modelo ocorre no comando de configuração, sem áudio do usuário.
- A chave local existente foi preservada, sem ser impressa nem copiada para os arquivos gerados.
- `.venv`, `.local-models`, `.local-cache`, áudios, TXT e arquivos de ambiente estão ignorados. A auditoria também rejeita pesos binários no Git.
- Pesos, ambiente Python e `.env` foram excluídos explicitamente do rastreamento de distribuição do Next.js; os modelos precisam ser provisionados no servidor, não entram automaticamente no bundle.
- A suíte normal bloqueia rede externa e o servidor E2E recebe chave vazia. Os testes de sucesso de API paga são mocks; os testes reais gratuitos usam apenas CPU e arquivos locais.
- O comando `npm run check:privacy` verifica candidatos, índice, histórico e bundles sem exibir valores de credenciais.

## Limitações

1. O modelo base pode errar com ruído, nomes próprios e gravações difíceis. A interface permite revisar o resultado. O idioma é detectado automaticamente; não há separação por locutor ou por mudanças de idioma entre trechos.
2. A velocidade depende da CPU; o modelo é carregado em cada processo. Há limite de um áudio por vez, até 14 minutos no backend local e 15 minutos no navegador.
3. O download inicial precisa de internet e espaço para pesos/dependências. Depois da configuração, a inferência não precisa da API nem de internet.
4. O teste de fala artificial usa Windows com as vozes Maria e Zira. Esse requisito é só do teste; transcrever arquivos do usuário não depende dessa voz. Outras plataformas não foram executadas neste ambiente.
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

## Atualização — temas e idioma automático

Atualizado em 14/11/2026 19:42:59 (Fortaleza).

- Adicionados Claro/Escuro/Sistema, persistência somente do tema no navegador, aplicação inicial sem flash, acompanhamento do sistema e funcionamento com localStorage bloqueado.
- Tema aplicado ao cabeçalho, cards, área de upload, player nativo, textarea, botões, estados de erro e painel de idioma. Capturas visuais dos dois temas foram conferidas.
- Contraste do texto do botão principal verificado em ambos os temas, inclusive hover, com razão mínima de 4,5:1. Layout de 375 px conferido sem rolagem horizontal.
- Whisper passou de idioma fixo para identificação automática. Código e probabilidade vêm de TranscriptionInfo; não foram criados percentuais de certeza a partir do texto ou do volume da voz.
- O painel exibe a estimativa do idioma e informa que ela não representa garantia nem precisão da transcrição. O score não é uma probabilidade calibrada de que toda a análise esteja correta.
- Dados ausentes/fora do intervalo não viram percentuais fictícios; o backend/UI validam metadados e mostram confiança não informada quando necessário.
- Resultados de idioma são limpos ao remover/substituir arquivo ou iniciar nova transcrição. A edição do texto não altera artificialmente o score do áudio.
- Testes reais com fala sintética portuguesa e inglesa confirmaram pt/en e probabilidades finitas entre 0 e 1. Áudio silencioso continua rejeitado sem painel de idioma fictício.
- Sexo/gênero da pessoa não foi inferido pela voz nem recebeu percentual artificial. Nenhuma identificação de pessoa ou classificação desse atributo foi implementada.
- Mantidas as limitações de ruído, falas curtas, múltiplos idiomas, modelo base e modo pago descritas acima; detecção probabilística pode errar.

## Conversão para desktop — 14/11/2026

Implementado Electron com janela nativa, menu, seletor de arquivos, salvamento TXT pelo sistema e preferências de tema persistidas fora do backend. A interface existente foi preservada. O aplicativo inclui Next.js standalone como serviço interno, Python oficial portátil 3.14.7, faster-whisper, bibliotecas de decodificação e modelo Whisper base. O computador de destino não precisa de Python, Node.js, navegador nem chave para o modo gratuito.

| Verificação executada | Resultado |
| --- | --- |
| ESLint e TypeScript | Aprovados |
| Build Next.js standalone e preparação de recursos | Aprovados; importações Python portátil verificadas |
| Testes unitários/backend com mocks e bloqueio externo | 92 aprovados; inclui token, origem, Unicode e ciclo de trabalhos desktop |
| Regressão da interface no Edge | 42 aprovados |
| Electron em desenvolvimento | Transcrição real de fala sintética com runtime portátil, edição, clipboard, TXT e tema entre reinícios aprovados |
| Executável Windows empacotado em win-unpacked | Mesmo teste completo aprovado, sem utilizar Python do sistema nem API paga |
| Privacidade do pacote | Arquivos de aplicação/configuração/ASAR verificados; nenhuma chave local, arquivo .env ou áudio encontrado |
| Privacidade Git/histórico/bundle | Nenhuma ocorrência; áudios sintéticos removidos após os testes |
| npm audit | Zero vulnerabilidades após overrides restritos de minimatch para ferramentas de build |

O backend escuta somente 127.0.0.1 com porta aleatória e token por abertura; requisições feitas fora da sessão desktop recebem 403. Renderer com sandbox, isolamento de contexto, Node desativado, navegação externa bloqueada e CSP. A ponte nativa expõe somente preferências de tema. Ao encerrar, os trabalhos são cancelados e os arquivos temporários são limpos. O pacote não inclui `.env.local`; o motor gratuito não recebe a chave da OpenAI. A transcrição não é salva automaticamente: TXT é gravado somente por ação do usuário.

Limitações: pacote Windows x64 e sem assinatura digital, podendo provocar aviso do SmartScreen; ainda não foi instalado em outro computador nem validado em macOS/Linux. O instalador é grande porque inclui o motor/modelo. O Whisper base pode errar e usar bastante CPU; continuam os limites de 25 MB, um áudio por vez e 14 minutos de processamento. A probabilidade do idioma não mede a precisão da transcrição. Não há inferência de sexo/gênero pela voz. Um encerramento abrupto do Windows pode impedir limpeza imediata de temporários. Os testes usam fala sintética, não áudios privados. Nenhuma chamada paga foi necessária nesta execução.

Revisão final de empacotamento: corrigido BOM no package.json e validado build limpo; excluídos dist-desktop, .desktop-build e artefatos de teste do rastreamento/cópia standalone para impedir pacotes recursivos; adicionada auditoria obrigatória antes do empacotamento e verificação de ABI Python 3.14 x64. Auditoria final dos arquivos do pacote sem credenciais, .env, áudio ou diretórios de builds anteriores. O teste completo foi repetido com sucesso no executável desta versão.

## Correção de seleção de áudio — desktop 0.1.1

Relato: clicar em Selecionar arquivo não abria a janela do Windows, impedindo selecionar o áudio e habilitar a transcrição. O fluxo anterior utilizava um input HTML; o teste antigo inseria o arquivo diretamente e não comprovava a abertura da janela do sistema. O seletor HTML também respondeu ao evento interceptado pela automação nesta máquina, portanto a causa específica da falha na instalação do usuário não foi reproduzida de forma conclusiva.

A versão 0.1.1 usa `dialog.showOpenDialog` no processo principal do Electron, com a Área de Trabalho como pasta inicial e filtros para OGG/OPUS/MP3/M4A/WAV/WEBM. A interface recebe somente nome e bytes do arquivo explicitamente escolhido. A ponte IPC valida origem/frame e não aceita caminhos arbitrários. Arquivos vazios, indisponíveis, extensões inválidas e tamanho acima de 25 MB recebem mensagens claras. A leitura é limitada a 25 MB mais um byte para detectar crescimento do arquivo, com fechamento em finally. Cancelar não altera o áudio anterior. O arquivo continua passando pelas validações de conteúdo do frontend/backend e só é transcrito após clique explícito.

Validação: 94 testes automatizados aprovados; 42 testes de interface aprovados; lint, TypeScript e build aprovados. O teste completo no executável empacotado 0.1.1 passou por botão de seleção, IPC real, leitura real do arquivo sintético, validação, player, transcrição Whisper portátil real, edição, cópia, TXT e persistência do tema. Apenas a resposta do diálogo do sistema foi simulada nesse teste. A tentativa de automatizar a janela real com Windows UI Automation não conseguiu controlá-la neste ambiente e não constitui confirmação manual de que a janela abre na instalação do usuário. Essa verificação permanece manual após instalar a atualização. Nenhuma API paga foi utilizada.

Privacidade: auditorias de repositório/histórico/bundle e pacote sem credenciais, arquivos .env ou áudios. O teste usa fala sintética temporária. O instalador 0.1.1 foi gerado; a versão portátil usa armazenamento sem segunda compressão pesada para evitar o timeout fixo de quatro minutos do NSIS, ficando maior. Feche a versão antiga antes de instalar/abrir a nova para impedir que o bloqueio de instância única apenas volte à janela anterior. Os executáveis continuam sem assinatura digital.

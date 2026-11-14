# Transcritor de Áudios WhatsApp

Aplicativo web para receber áudios do WhatsApp e converter fala em texto com inteligência artificial.

A interface principal está implementada com seleção e arraste de um áudio (até 25 MB), validação local, informações do arquivo, player, simulação visual de processamento e campo de texto editável com cópia e exportação TXT. Não há envio de arquivos, armazenamento ou integração com IA. A simulação não gera uma transcrição; insira texto manualmente para experimentar cópia e download.

## Tecnologias

- Next.js 16 com App Router e React 19
- TypeScript em modo estrito
- Tailwind CSS 4 via PostCSS
- ESLint 9 com as regras Core Web Vitals e TypeScript do Next.js
- npm com lockfile para instalações reproduzíveis

## Requisitos e execução

Node.js 20.9 ou superior e npm. Recomenda-se uma versão LTS suportada do Node.js.

```sh
npm ci
npm run dev
```

Abra http://localhost:3000. Nenhuma chave de API ou variável de ambiente é necessária. O arquivo `.env.example` documenta esse estado; futuras configurações locais devem ficar em `.env.local`, que é ignorado pelo Git.

No PowerShell, caso a política de execução bloqueie `npm.ps1`, use `npm.cmd` no lugar de `npm`, sem alterar a política do sistema.

## Comandos

```sh
npm run lint       # ESLint, sem avisos
npm run typecheck  # Verificação de tipos
npm run build      # Build de produção
npm run start      # Servidor de produção, após o build
```

## Organização

```text
src/
  app/
    api/health/route.ts  # Endpoint GET /api/health
    globals.css          # Tailwind e estilos globais
    layout.tsx           # Layout raiz e metadados
    page.tsx             # Página inicial
  components/
    layout/              # Componentes de estrutura da interface
    ui/                  # Componentes visuais reutilizáveis
  server/                # Serviços exclusivos do backend
  types/                 # Espaço para futuros contratos compartilhados
public/                  # Arquivos estáticos
```

O App Router reúne páginas e Route Handlers. Componentes são Server Components por padrão; adicione `"use client"` somente quando houver necessidade de estado, eventos ou APIs do navegador. Os serviços do backend ficam em `src/server` e utilizam `server-only` para impedir importação em código de cliente. Futuras credenciais de IA devem permanecer exclusivamente no servidor e nunca usar o prefixo `NEXT_PUBLIC_`.

Use o alias `@/` para importar módulos de `src`. Mantenha lógica de negócio fora dos componentes de interface e exponha operações do backend por Route Handlers em `src/app/api`.

## Verificação manual

Com o servidor ativo, a página inicial deve mostrar o nome do aplicativo e o aviso de desenvolvimento. `GET /api/health` deve responder HTTP 200 com:

```json
{ "status": "ok", "service": "transcritor-whatsapp" }
```

O `INDEX.HTML` preexistente foi preservado e não faz parte das rotas Next.js.

Referências: [instalação do Next.js](https://nextjs.org/docs/app/getting-started/installation) e [Tailwind com Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs).

## Validacao da estrutura inicial

- ESLint sem avisos, TypeScript e build de producao aprovados.
- Servidor de producao iniciado e respostas HTTP 200 verificadas em `/` e `/api/health`.
- `npm audit --omit=dev`: nenhuma vulnerabilidade encontrada na verificacao inicial.
- A auditoria completa reportou sete alertas moderados na cadeia de dependencias de desenvolvimento do ESLint; `npm audit fix` nao os resolveu. Reavaliar ao atualizar essas ferramentas.

Se a instalacao neste Windows apresentar `UNABLE_TO_VERIFY_LEAF_SIGNATURE` e a autoridade certificadora ja for confiavel no sistema, o Node.js 24 pode usar os certificados do Windows. No PowerShell, execute `$env:NODE_USE_SYSTEM_CA = '1'` antes de `npm.cmd ci`. Nao desative a verificacao TLS.

## Verificacao manual da interface

1. Selecione ou arraste um audio de ate 25 MB; confira nome, tamanho, formato e player.
2. Experimente um arquivo vazio, acima do limite, de formato invalido ou varios arquivos; confira a mensagem de erro.
3. Clique em "Transcrever audio"; confira o indicador de simulacao e o aviso final de IA indisponivel, sem texto gerado.
4. Digite ou cole texto no campo e teste "Copiar texto" e "Baixar TXT". A copia depende da permissao de clipboard do navegador e de HTTPS ou localhost.
5. Remova ou substitua o audio; confira que o estado e o texto anterior sao limpos e o processamento pendente e cancelado.
6. Confira o layout em tela estreita e a navegacao por teclado. O suporte de reproducao depende dos codecs do navegador; arquivos nao reproduziveis exibem orientacao.

A interface foi validada com lint, TypeScript, build e resposta HTTP. As interacoes em navegador precisam de verificacao manual neste ambiente, que nao possui ferramenta de automacao de navegador instalada.

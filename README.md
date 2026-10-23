# Workland

Área de trabalho em 3D pro Windows. Um salão circular com os seus apps, pastas, janelas abertas e o status do PC nas paredes, dentro de um ambiente à sua escolha.

## Rodar

```
npm install
npm start        # compila e abre o app
npm run dev      # modo desenvolvimento (Vite + Electron com recarga)
npm run dist     # gera o instalador em release/Workland Setup x.y.z.exe (não publica nada)
npm run release  # gera e publica a versão no GitHub (ver "Lançar uma versão")
```

O instalador instala só pro usuário (sem administrador) em `%LOCALAPPDATA%\Programs\Workland` e cria atalho na Área de Trabalho e no menu Iniciar. Depois de mudar o código, é só rodar `npm run dist` e executar o instalador de novo.

Se o `electron-builder` reclamar de "Cannot create symbolic link" ao extrair o `winCodeSign`, extraia o `.7z` dele manualmente em `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0` (os erros são só de arquivos do macOS).

## Atualização automática

O app instalado procura versão nova nas releases públicas de [PedroTrindade05/workland](https://github.com/PedroTrindade05/workland/releases) uns segundos depois de abrir e a cada 4 horas (`electron-updater`, config em `build.publish` no `package.json`). Achou, baixa por trás e mostra no canto do HUD "Versão x.y.z pronta, reinicie quando quiser". O botão **Reiniciar** fecha, instala em silêncio e abre de novo. Se a pessoa clicar em **Depois** ou só fechar o Workland, a versão nova entra nesse fechamento.

Sem release publicada, sem internet ou com o GitHub fora do ar, a checagem só registra no console e tenta de novo depois. Rodando com `npm start`/`npm run dev` ou no modo de teste escondido, não checa nada.

### Lançar uma versão

1. Uma vez só: o repo `PedroTrindade05/workland` precisa existir no GitHub, público e com pelo menos um commit (repo vazio não aceita release; criar com README já resolve). O código também está nele (branch main); as releases ficam na mesma página.
2. Uma vez só: criar um token em github.com/settings/tokens. Pode ser *fine-grained* só pro repo `workland` com **Contents: Read and write**, ou *classic* com o escopo `public_repo`.
3. Subir o número em `"version"` no `package.json` (ex.: `0.6.0` para `0.7.0`). Tem que ser maior que a versão instalada, senão ninguém atualiza.
4. Rodar no PowerShell:

   ```
   $env:GH_TOKEN = "seu_token"
   npm run release
   ```

   Isso compila, gera `release/Workland Setup x.y.z.exe`, o `.blockmap` e o `latest.yml`, cria a release `vx.y.z` no GitHub e sobe os três arquivos. Quem estiver com o Workland aberto recebe o aviso em até 4 horas, ou na próxima vez que abrir.

`npm run dist` continua gerando o instalador (e o `latest.yml`) sem publicar nada, mesmo com `GH_TOKEN` definido.

## Como funciona

- **Aplicativos**: tudo que aparece no menu Iniciar (inclusive apps da Store), com ícones em 256px. A lista fica em cache em `%APPDATA%/workland/apps-cache.json` e se atualiza sozinha.
- **Arquivos**: Área de Trabalho, Downloads, Documentos, Imagens, Músicas, Vídeos e a pasta do usuário. Pastas abrem na própria parede.
- **Telas**: cada janela aberta vira um telão ao vivo (`desktopCapturer`). Entrar numa tela voa a câmera até ela e encaixa a janela real exatamente em cima (`electron/win32.cjs`, via koffi). Clique fora ou `Alt+Q` devolve a janela pro lugar.
- **Abrir aqui dentro**: abrir app ou arquivo espera a janela nova aparecer e entra nela.
- **Ambientes**: Escritório, Galeria e Órbita (`src/themes.ts` + `src/world/Scenery.tsx`), todos realistas (`theme.real`). O Escritório é uma cobertura com céu de foto HDRI, taco, forro de nogueira, fachada de vidro e móveis de verdade (`src/world/Office.tsx`); a Galeria é um museu de pé-direito alto com concreto polido, claraboias com brises (o sol do meio-dia desenha faixas no piso), quadros abstratos gerados no próprio app num atlas só, spots de trilho, esculturas e o jardim da foto atrás do vidro (`src/world/Gallery.tsx`); a Órbita é uma estação com a Terra das texturas da NASA (`src/world/Station.tsx`). Os arquivos ficam em `public/world` (créditos em `public/world/CREDITS.md`, tudo CC0 ou domínio público) e carregam por `assetUrl()`, que no app passa pelo protocolo `wlfile`. Pós-processamento com oclusão de ambiente (N8AO), bloom e tone mapping AgX.
- **Qualidade**: Leve, Equilibrada (padrão) e Alta (espelho em tempo real).
- **Apresentação**: modelo de sala com palco, telão de 12 m, púlpito e plateia (`src/objects/stage.tsx`). E no púlpito (ou **Mostrar** na barra) escolhe o que vai no telão: PDF (pdf.js, carregado só quando usa), imagens e vídeos, a tela de um app ao vivo ou um site. **Assistir** enquadra o telão; PageDown/PageUp passam as páginas (setas e espaço também, assistindo). Em cima do palco o chão fica a 50 cm.
- **Encontro** (`M` ou dock): um Workland cria a sala na rede local (`electron/meet.cjs`: HTTP + WebSocket na porta 47810, descoberta por UDP 47811) e os colegas acham na lista e entram com o PIN de 4 dígitos. Cada um aparece com o boneco do provador e o nome em cima; quem tem a vez manda no telão e pode passar a vez; reações 👏 ✋ sobem em cima de quem mandou. Arquivos da apresentação vão pela própria sala (HTTP com Range), a tela de app vai por WebRTC direto entre os PCs. Nada passa pela internet. Na primeira vez o Windows pergunta se pode usar a rede (permitir em redes privadas).
- **Assistir pelo navegador**: a própria sala serve uma página (`electron/viewer.html`) em `http://IP:47810/?pin=PIN`. Quem está na rede abre o link (ou lê o QR code do painel do Encontro) e vê o telão em tela cheia, sem instalar nada, inclusive no celular: PDF desenhado com o pdf.js do próprio build (`/app/pdf-*.js`), imagens e vídeos direto da sala, tela de app por WebRTC e site em iframe (com botão de abrir). Quem assiste assim não vira boneco nem pega a vez; as reações sobem pelo telão do Workland e a barra de quem apresenta mostra quantos estão no navegador.
- **Provador** (`P` ou dock): o boneco padrão por partes, no estilo de jogo de festa: 15 chapéus, 7 rostos, 8 roupas, 6 extras (mochila, capa, jetpack, asinhas, cachecol), calça, calçado, 3 formatos de corpo, 5 estampas e 5 cores. Tem 15 visuais prontos (arquétipos originais), Sortear (`R`) e Desfazer (`Ctrl+Z`). A câmera vem pra frente do boneco num lado sem nada no caminho; arrastar gira, rodinha aproxima. Tudo procedural (`src/avatar/look.ts` + `src/world/AvatarParts.tsx`), salvo em `settings.avatar` e no exportar setup.

## Controles

WASD anda, Shift corre, Espaço pula, arrastar gira a câmera, `V` alterna 1ª/3ª pessoa, `E` ou clique abre, `F` ação extra, `/` busca, `T` ambientes, `P` provador, `M` encontro, `1` a `6` atalhos do dock.

## Testes sem abrir janela

`WORKLAND_HIDDEN=1 WORKLAND_DEBUG_PORT=9333 npx electron .` renderiza fora da tela e expõe o DevTools Protocol na porta 9333. No console, `window.__workland` tem `teleport`, `enterWindow` e a store; `__meet`, `__present` e `__rtc` mexem no encontro e no telão.

Pra testar o encontro, abra dois escondidos com `WORKLAND_PROFILE` diferente (ex.: `workland-test` na 9333 e `workland-test2` na 9334). No modo escondido a sala só escuta no próprio PC (127.0.0.1), então o firewall não pergunta nada.

Pra testar a atualização sem mexer no Workland instalado, some `WORKLAND_UPDATE_FEED`: `=github` checa o repo de verdade e `=http://127.0.0.1:porta/` usa um feed local com `latest.yml` falso. Nesse modo a config fica no perfil de teste, o download vai pra `%LOCALAPPDATA%\workland-test-updater` e o botão Reiniciar só registra o pedido, nunca instala.
